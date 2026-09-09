from typing import List
from fastapi import APIRouter, Request
from app.models.schemas import TrafficPrediction
from app.services.prediction_service import get_traffic_predictions
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/predictions", tags=["Traffic ML Forecasting"])

@router.get("", response_model=List[TrafficPrediction])
@limiter.limit("60/minute")
def get_predictions(request: Request):
    """Retrieve XGBoost & LSTM time-series forecasts for 5, 15, and 30-minute horizons."""
    return get_traffic_predictions()
