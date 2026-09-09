import hashlib
from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def anonymize_plate(raw_plate: str) -> str:
    """
    SECURITY HARDENING: Data Anonymization / Privacy
    Hashes license plate numbers using SHA-256 with a secure salt.
    Prevents raw PII (License Plate Data) from being stored or exposed.
    Returns a deterministic anonymized hash token like 'PLT-A3F8B2C1d'.
    """
    if not raw_plate:
        return "PLT-ANONYMOUS"
    
    clean_plate = raw_plate.replace(" ", "").replace("-", "").upper()
    salted = f"{settings.ANPR_SALT}:{clean_plate}"
    digest = hashlib.sha256(salted.encode('utf-8')).hexdigest()
    return f"PLT-{digest[:10].upper()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject), "role": "operator"}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
