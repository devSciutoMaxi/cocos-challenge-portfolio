// Redondeo a 2 decimales (centavos). Compartido por órdenes y portfolio.
// El "+ 0" convierte -0 en 0 (por ejemplo, redondear -0.001 daría -0).
export const roundMoney = (value: number): number => Math.round(value * 100) / 100 + 0;
