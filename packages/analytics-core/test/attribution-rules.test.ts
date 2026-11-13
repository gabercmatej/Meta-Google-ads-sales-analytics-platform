import { describe, expect, it } from 'vitest';
import { classifyOrder } from '../src/attribution.js';
import { generateShowcaseDataset } from '../src/showcase/generate.js';

// The demo's Attribution page states these rules in plain words; this keeps the text true for the data.
const ds = generateShowcaseDataset();

describe('showcase attribution rules hold in the synthetic data', () => {
  it('a repeat order is never verified paid-ad revenue (it only carries the customer label)', () => {
    const byCustomer = new Map<string, typeof ds.orders>();
    for (const o of ds.orders) byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);
    let repeats = 0;
    for (const orders of byCustomer.values()) {
      const sorted = [...orders].sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
      for (const o of sorted.slice(1)) {
        if (o.leadId !== null) continue; // a repeat that came through a new lead has its own evidence
        repeats++;
        expect(classifyOrder(o).status).not.toBe('attributed_paid_ad');
      }
    }
    expect(repeats).toBeGreaterThan(10);
  });

  it('a chatbot-labelled order is classified Chatbot/AI, never as a Meta or Google conversion', () => {
    const chat = ds.orders.filter((o) => o.evidence.some((e) => e.kind === 'source_label' && e.label === 'Chatbot'));
    expect(chat.length).toBeGreaterThan(5);
    for (const o of chat) expect(classifyOrder(o)).toMatchObject({ status: 'source_only', label: 'Chatbot' });
  });
});
