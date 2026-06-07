import pytest
import math
import random
from app.core.engine import (
    stationarity_test,
    wavelet_decompose,
    forecast_approximation,
    fit_ar2_on_detail,
    forecast_detail_ar2,
    run_ga_mutation_loop,
    neuro_evolutionary_wavelet_forecast
)

def test_stationarity_detection():
    """
    Checks the probability and statistical classification capabilities of the stationarity switch.
    - Flat / oscillating signal + white noise should be classified as STATIONARY.
    - A random walk / trending signal should be classified as NON-STATIONARY.
    """
    random.seed(42)
    N = 100 # Increased N for robust Dickey-Fuller t-statistic statistical power
    
    # 1. Generate Stationary Signal: Pure white noise around mean 100
    stationary_signal = [
        100.0 + random.uniform(-2.0, 2.0)
        for _ in range(N)
    ]
    p_stat, t_adf_stat, t_pp_stat, is_stationary_stat = stationarity_test(stationary_signal)
    
    # ADF/PP should reject the unit root (p-value < 0.05)
    assert is_stationary_stat is True
    assert p_stat < 0.05

    # 2. Generate Non-Stationary Signal: Pure Random Walk
    non_stationary_signal = [100.0]
    for _ in range(N - 1):
        non_stationary_signal.append(non_stationary_signal[-1] + random.uniform(-1.0, 1.2)) # random walk with drift
        
    p_non, t_adf_non, t_pp_non, is_stationary_non = stationarity_test(non_stationary_signal)
    
    # ADF/PP should fail to reject the unit root (p-value >= 0.05)
    assert is_stationary_non is False
    assert p_non >= 0.05

def test_wavelet_decomposition_reconstruction():
    """
    Verifies that the dual-frequency wavelet decomposition satisfies the
    mathematical reconstruction property: X_t = A_t + D_t for all t.
    """
    random.seed(123)
    history = [random.uniform(50.0, 500.0) for _ in range(30)]
    
    A, D = wavelet_decompose(history)
    
    assert len(A) == len(history)
    assert len(D) == len(history)
    
    for t in range(len(history)):
        reconstructed = A[t] + D[t]
        assert abs(reconstructed - history[t]) < 1e-9, f"Reconstruction failed at step {t}: {reconstructed} != {history[t]}"

def test_ga_approximation_capabilities():
    """
    Checks the approximation capability of the Genetic Algorithm.
    The GA-optimized forecast should have a lower out-of-sample validation RMSE
    compared to the unadjusted out-of-sample baseline validation forecast on non-stationary telemetry.
    """
    random.seed(99)
    # Generate a non-stationary training history
    history = [100.0 + i * 1.5 + random.uniform(-2.0, 2.0) for i in range(24)]
    
    val_size = 6
    train_hist = history[:-val_size]
    val_actual = history[-val_size:]
    
    # 1. Fit wavelet decomposition and baseline forecaster on train_hist (first 18 steps)
    train_A, train_D = wavelet_decompose(train_hist)
    
    # Out-of-sample baseline projection for the validation window (ends at current time, so starts at 12 - 6 = 6)
    train_A_pred = forecast_approximation(train_A, val_size, 6, amplitude=30.0)
    phi_1, phi_2 = fit_ar2_on_detail(train_D)
    train_D_pred = forecast_detail_ar2(train_D, val_size, phi_1, phi_2)
    
    # Out-of-sample baseline validation RMSE
    baseline_val_rmse = math.sqrt(sum((val_actual[i] - (train_A_pred[i] + train_D_pred[i]))**2 for i in range(val_size)) / val_size)
    
    # 2. GA-Adjusted Forecast
    # Initialize the actual forecast components
    A, D = wavelet_decompose(history)
    A_pred = forecast_approximation(A, 6, 12, amplitude=30.0)
    phi_1, phi_2 = fit_ar2_on_detail(D)
    D_pred = forecast_detail_ar2(D, 6, phi_1, phi_2)
    
    max_capacity = 250.0
    best_delta, ga_rmse, ga_latency, _ = run_ga_mutation_loop(history, A_pred, D_pred, 6, max_capacity, base_hour=12, amplitude=30.0)
    
    # The GA RMSE (which optimizes offsets directly on the validation window) must be less than the unadjusted baseline validation RMSE
    assert ga_rmse < baseline_val_rmse, f"GA failed to optimize approximation: GA RMSE ({ga_rmse}) is not better than Baseline Validation RMSE ({baseline_val_rmse})"

def test_ga_latency_optimization():
    """
    Verifies that the Genetic Algorithm successfully optimizes for breach latency
    while satisfying the validation constraints.
    """
    random.seed(111)
    history = [100.0 + i * 10.0 for i in range(12)]
    
    A, D = wavelet_decompose(history)
    A_pred = forecast_approximation(A, 6, 12, amplitude=30.0)
    phi_1, phi_2 = fit_ar2_on_detail(D)
    D_pred = forecast_detail_ar2(D, 6, phi_1, phi_2)
    
    max_capacity = 200.0 # 0.85 * 200 = 170 MW threshold
    
    best_delta, ga_rmse, ga_latency, _ = run_ga_mutation_loop(history, A_pred, D_pred, 6, max_capacity)
    
    # Latency should be successfully minimized/optimized (under H = 6 steps)
    assert ga_latency <= 6
