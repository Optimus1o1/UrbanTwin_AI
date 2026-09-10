from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from app.models.schemas import Token, LoginRequest
from app.core.security import create_access_token
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Demo credentials for development
VALID_CREDENTIALS = {
    "admin": "admin123",
    "operator": "password123",
}

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest):
    """
    Authenticate user and return JWT bearer access token.
    Enforces Rate Limiting (10/min) to prevent brute-force attacks.
    """
    if payload.username in VALID_CREDENTIALS and payload.password == VALID_CREDENTIALS[payload.username]:
        token = create_access_token(subject=payload.username)
        return Token(access_token=token, token_type="bearer", user=payload.username)
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials. Hint: user 'admin' pass 'admin123'",
        headers={"WWW-Authenticate": "Bearer"},
    )

@router.post("/token", response_model=Token)
@limiter.limit("10/minute")
def get_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2-compatible token endpoint for Swagger UI 'Authorize' button.
    Accepts standard form-encoded `username` and `password` fields.
    Returns JWT access token for API authentication.
    """
    if form_data.username in VALID_CREDENTIALS and form_data.password == VALID_CREDENTIALS[form_data.username]:
        token = create_access_token(subject=form_data.username)
        return Token(access_token=token, token_type="bearer", user=form_data.username)
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials. Hint: user 'admin' pass 'admin123'",
        headers={"WWW-Authenticate": "Bearer"},
    )
