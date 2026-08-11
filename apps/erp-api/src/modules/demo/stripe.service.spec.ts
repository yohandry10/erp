import { StripeService } from './stripe.service';

describe('StripeService prepaid commercial term', () => {
  it('cobra una sola vez y congela la promoción en metadata', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'cs_488',
      url: 'https://checkout.example/488',
    });
    const service = new StripeService();
    (service as any).stripe = { checkout: { sessions: { create } } };

    const result = await service.createCheckoutSession({
      tenantId: '48800000-0000-4000-8000-000000000001',
      planId: 'basico',
      periodo: 'semestral',
      monto: 594,
      moneda: 'PEN',
      mesesPagados: 6,
      mesesBonificados: 3,
      mesesServicio: 9,
      email: 'cliente@example.com',
      razonSocial: 'Empresa Cliente SAC',
      ruc: '20123456786',
      successUrl: 'https://erp.example/success',
      cancelUrl: 'https://erp.example/cancel',
    });

    expect(result).toEqual({ url: 'https://checkout.example/488', sessionId: 'cs_488' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      line_items: [expect.objectContaining({
        price_data: expect.objectContaining({ currency: 'pen', unit_amount: 59400 }),
      })],
      metadata: expect.objectContaining({
        periodo: 'semestral',
        meses_pagados: '6',
        meses_bonificados: '3',
        meses_servicio: '9',
      }),
    }));
  });
});
