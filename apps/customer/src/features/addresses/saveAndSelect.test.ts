import { createMockServices } from '@/services/mock';

import { saveAddressAndMaybeSelect } from './saveAndSelect';

const newAddress = {
  label: 'other' as const,
  line1: 'Flat 12, Sunrise Towers',
  locality: 'Baner',
  city: 'Pune',
  postalCode: '411045',
};

describe('saveAddressAndMaybeSelect', () => {
  it('selects a new address added from checkout', async () => {
    const { location } = createMockServices({ latencyMs: 0 });
    const { address, selected } = await saveAddressAndMaybeSelect({
      location,
      input: newAddress,
      selectAfterSave: true,
    });
    expect(selected).toBe(true);
    expect((await location.listAddresses()).selectedId).toBe(address.id);
    expect((await location.getDeliveryAddress()).locality).toBe('Baner');
  });

  it('leaves the selection alone outside checkout', async () => {
    const { location } = createMockServices({ latencyMs: 0 });
    const before = (await location.listAddresses()).selectedId;
    const { selected } = await saveAddressAndMaybeSelect({
      location,
      input: newAddress,
      selectAfterSave: false,
    });
    expect(selected).toBe(false);
    expect((await location.listAddresses()).selectedId).toBe(before);
  });

  it('never changes the selection when editing, even from checkout', async () => {
    const { location } = createMockServices({ latencyMs: 0 });
    const { addresses, selectedId } = await location.listAddresses();
    const other = addresses.find((a) => a.id !== selectedId)!;
    const { selected } = await saveAddressAndMaybeSelect({
      location,
      input: { ...other, line1: 'Office 8C, Panchshil Tech Park' },
      selectAfterSave: true,
    });
    expect(selected).toBe(false);
    expect((await location.listAddresses()).selectedId).toBe(selectedId);
  });

  it('keeps the saved address and reports not selected if selecting fails', async () => {
    const { location } = createMockServices({ latencyMs: 0 });
    const result = await saveAddressAndMaybeSelect({
      location: {
        saveAddress: location.saveAddress,
        setDeliveryAddress: () => Promise.reject(new Error('offline')),
      },
      input: newAddress,
      selectAfterSave: true,
    });
    expect(result.selected).toBe(false);
    expect((await location.listAddresses()).addresses.map((a) => a.id)).toContain(
      result.address.id,
    );
  });

  it('does not select anything when saving fails', async () => {
    const { location } = createMockServices({ latencyMs: 0 });
    const before = await location.listAddresses();
    await expect(
      saveAddressAndMaybeSelect({
        location,
        input: { ...newAddress, postalCode: '12' },
        selectAfterSave: true,
      }),
    ).rejects.toThrow();
    expect(await location.listAddresses()).toEqual(before);
  });
});
