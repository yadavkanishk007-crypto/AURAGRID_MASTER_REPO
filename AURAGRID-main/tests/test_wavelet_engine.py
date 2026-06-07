import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.engine import neuro_evolutionary_wavelet_forecast

client = TestClient(app)

def test_physics_boundaries():
    """
    Asserts that no output vector inside the predicted horizon falls
    below the hard physical limit of 5.0 MW.
    """
    history = [10.0, 8.0, 6.0, 4.0, 2.0, 1.0, 3.0, 5.0, 6.0, 7.0]
    res = neuro_evolutionary_wavelet_forecast("Sharavathi Hydro Hub", history, 12, 10)
    for val in res["predicted_load_vectors"]:
        assert val >= 5.0, f"Predicted load {val} fell below the hard physical limit of 5.0 MW."

def test_endpoint_contract():
    """
    Verifies via TestClient that POST /api/v1/predict/cascade-horizon returns
    HTTP status 200 and retains all original array structures expected by the React layer.
    """
    payload = {
        "network_id": "BESCOM_Bengaluru_Grid",
        "timestamp_utc": "2026-06-06T15:55:00Z",
        "historical_telemetry_stream": [120.0, 200.0, 300.0],
        "structural_link_coefficients": [0.15, 0.12, 0.10],
        "active_nodes_in_partition": 3
    }
    
    response = client.post("/api/v1/predict/cascade-horizon?horizon=6&city_id=bengaluru", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    # Check that requested keys are present
    assert "status" in data
    assert "horizon_steps" in data
    assert "mode_activated" in data
    assert "stationarity_tests" in data
    assert "multi_objective_optimization" in data
    assert "confusion_matrix_metrics" in data
    assert "predicted_load_vectors" in data
    
    # Check that original array structures/nodes are present at root level for backward compatibility
    from app.core.config import settings
    nodes = [node.name for node in settings.all_cities["bengaluru"].nodes]
    for node in nodes:
        assert node in data, f"Node '{node}' was not found in response root. Next.js UI might break."
        node_data = data[node]
        assert "node_id" in node_data
        assert "system_state_evaluation" in node_data
        assert "forecast_horizon_metrics" in node_data
        assert "propagation_path_alert" in node_data
        
        # Check specific nested keys expected by Next.js
        assert "calculated_peak_load_target" in node_data["forecast_horizon_metrics"]
        assert "capacity_rate_of_change_delta" in node_data["forecast_horizon_metrics"]
        assert "system_structural_limit" in node_data["forecast_horizon_metrics"]
        assert "is_anomaly_detected" in node_data["propagation_path_alert"]
        assert "primary_downstream_exposure_vector" in node_data["propagation_path_alert"]

def test_confusion_matrix_integrity():
    """
    Asserts that the total false negatives array count is statistically minimized (< 2)
    to validate the model's safety response profiles.
    """
    payload = {
        "network_id": "BESCOM_Bengaluru_Grid",
        "timestamp_utc": "2026-06-06T15:55:00Z",
        "historical_telemetry_stream": [120.0, 200.0, 300.0],
        "structural_link_coefficients": [0.15, 0.12, 0.10],
        "active_nodes_in_partition": 3
    }
    response = client.post("/api/v1/predict/cascade-horizon?horizon=6&city_id=bengaluru", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    # Assert FN < 2
    metrics = data["confusion_matrix_metrics"]
    assert metrics["false_negatives"] < 2, f"False negatives {metrics['false_negatives']} was not < 2."
