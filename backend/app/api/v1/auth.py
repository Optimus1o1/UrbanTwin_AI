from fastapi import APIRouter, HTTPException, Depends, Request, status
from app.models.schemas import Token, LoginRequest
from app.core.security import create_access_token
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest):
    """
    Authenticate user and return JWT bearer access token.
    Enforces Rate Limiting (10/min) to prevent brute-force attacks.
    """
    # Demo authentication validation
    if payload.username in ["admin", "operator"] and payload.password in ["password123", "admin123"]:
        token = create_access_token(subject=payload.username)
        return Token(access_token=token, token_type="bearer", user=payload.username)
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials. Hint: user 'admin' pass 'admin123'",
        headers={"WWW-Authenticate": "Bearer"},
    )
