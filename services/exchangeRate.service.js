// services/exchangeRate.service.ts

const BASE_URL = "https://api.frankfurter.dev";

export const getExchangeRates = async (curr, base) => {
    const response = await fetch(`${BASE_URL}/v2/rate/${curr}/${base}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch exchange rate ${curr}->${base}: ${response.status}`);
    }

    const data = await response.json();
    return data.rate;
};