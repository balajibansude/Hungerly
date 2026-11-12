import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  call,
  createActiveBranch,
  createTestContext,
  signInOwner,
  type TestContext,
} from './harness';

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof signInOwner>>;
let branchId: string;
let categoryId: string;

interface MenuBody {
  categories: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      foodType: string;
      price: { amountMinor: number };
      isAvailable: boolean;
      isArchived: boolean;
      imageUrl: string | null;
    }[];
  }[];
}

function multipart(fileName: string, mime: string, data: Buffer) {
  const boundary = '----hungerlytest' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, data, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await signInOwner(ctx);
  ({
    branch: { id: branchId },
  } = await createActiveBranch(ctx, owner.userId));
  const res = await call<{ id: string }>(
    ctx,
    'POST',
    `/partner/branches/${branchId}/menu/categories`,
    {
      token: owner.token,
      body: { name: 'Starters' },
    },
  );
  categoryId = res.body.id;
});
afterAll(async () => {
  await ctx.close();
});

describe('menu management', () => {
  it('persists new items and returns them from a fresh request', async () => {
    const created = await call<{ id: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items`,
      {
        token: owner.token,
        body: { categoryId, name: 'Hara Bhara Kebab', priceMinor: 19_900, foodType: 'veg' },
      },
    );
    expect(created.status).toBe(201);
    const menu = await call<MenuBody>(ctx, 'GET', `/partner/branches/${branchId}/menu`, {
      token: owner.token,
    });
    const item = menu.body.categories[0]!.items.find((i) => i.id === created.body.id);
    expect(item).toMatchObject({
      name: 'Hara Bhara Kebab',
      foodType: 'veg',
      price: { amountMinor: 19_900 },
    });
  });

  it('stores the food type exactly as chosen, never inferred from the name', async () => {
    // A name that "sounds" vegetarian is stored with the owner's explicit classification.
    const nonVeg = await call<{ foodType: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items`,
      {
        token: owner.token,
        body: { categoryId, name: 'Veg Special Thali', priceMinor: 25_000, foodType: 'non_veg' },
      },
    );
    expect(nonVeg.body.foodType).toBe('non_veg');
    const jain = await call<{ id: string; foodType: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items`,
      {
        token: owner.token,
        body: { categoryId, name: 'Paneer Tikka', priceMinor: 25_000, foodType: 'jain' },
      },
    );
    expect(jain.body.foodType).toBe('jain');
    const veg = await call<{ foodType: string }>(
      ctx,
      'PATCH',
      `/partner/branches/${branchId}/menu/items/${jain.body.id}`,
      {
        token: owner.token,
        body: { foodType: 'veg' },
      },
    );
    expect(veg.body.foodType).toBe('veg');
  });

  it('validates prices, names and categories', async () => {
    const cheap = await call(ctx, 'POST', `/partner/branches/${branchId}/menu/items`, {
      token: owner.token,
      body: { categoryId, name: 'Water', priceMinor: 50, foodType: 'veg' },
    });
    expect(cheap.status).toBe(422);
    const noType = await call(ctx, 'POST', `/partner/branches/${branchId}/menu/items`, {
      token: owner.token,
      body: { categoryId, name: 'Mystery', priceMinor: 10_000 },
    });
    expect(noType.status).toBe(422);
    const { branch: other } = await createActiveBranch(ctx, owner.userId, { name: 'Second' });
    const foreignCategory = await call(ctx, 'POST', `/partner/branches/${other.id}/menu/items`, {
      token: owner.token,
      body: { categoryId, name: 'Wrong Category', priceMinor: 10_000, foodType: 'veg' },
    });
    expect(foreignCategory.status).toBe(422);
  });

  it('toggles availability and archives items', async () => {
    const created = await call<{ id: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items`,
      {
        token: owner.token,
        body: { categoryId, name: 'Chilli Paneer', priceMinor: 22_000, foodType: 'veg' },
      },
    );
    const off = await call<{ isAvailable: boolean }>(
      ctx,
      'PATCH',
      `/partner/branches/${branchId}/menu/items/${created.body.id}/availability`,
      {
        token: owner.token,
        body: { isAvailable: false },
      },
    );
    expect(off.body.isAvailable).toBe(false);
    const archived = await call<{ isArchived: boolean }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items/${created.body.id}/archive`,
      {
        token: owner.token,
      },
    );
    expect(archived.body.isArchived).toBe(true);
    const menu = await call<MenuBody>(ctx, 'GET', `/partner/branches/${branchId}/menu`, {
      token: owner.token,
    });
    expect(menu.body.categories.flatMap((c) => c.items).some((i) => i.id === created.body.id)).toBe(
      false,
    );
    const withArchived = await call<MenuBody>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/menu?includeArchived=true`,
      { token: owner.token },
    );
    expect(
      withArchived.body.categories.flatMap((c) => c.items).some((i) => i.id === created.body.id),
    ).toBe(true);
    const reEnable = await call(
      ctx,
      'PATCH',
      `/partner/branches/${branchId}/menu/items/${created.body.id}/availability`,
      {
        token: owner.token,
        body: { isAvailable: true },
      },
    );
    expect(reEnable.status).toBe(409);
  });

  it('uploads an item photo, checks its real type, and serves it publicly', async () => {
    const created = await call<{ id: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/menu/items`,
      {
        token: owner.token,
        body: { categoryId, name: 'Samosa', priceMinor: 6_000, foodType: 'veg' },
      },
    );
    const url = `/api/v1/partner/branches/${branchId}/menu/items/${created.body.id}/image`;
    const fake = multipart('evil.png', 'image/png', Buffer.from('<script>alert(1)</script>'));
    const rejected = await ctx.app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': fake.contentType },
      payload: fake.body,
    });
    expect(rejected.statusCode).toBe(422);

    const good = multipart('samosa.png', 'image/png', PNG);
    const uploaded = await ctx.app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': good.contentType },
      payload: good.body,
    });
    expect(uploaded.statusCode).toBe(200);
    const imageUrl = (uploaded.json() as { imageUrl: string }).imageUrl;
    expect(imageUrl).toMatch(/\/api\/v1\/media\/menu\/.+\.png$/);
    const path = new URL(imageUrl).pathname;
    const served = await ctx.app.inject({ method: 'GET', url: path });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    const traversal = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/menu/../private/x',
    });
    expect(traversal.statusCode).toBe(404);
  });

  it('another owner cannot read or change this menu', async () => {
    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId, { name: 'Elsewhere' });
    expect(
      (await call(ctx, 'GET', `/partner/branches/${branchId}/menu`, { token: intruder.token }))
        .status,
    ).toBe(404);
    const create = await call(ctx, 'POST', `/partner/branches/${branchId}/menu/items`, {
      token: intruder.token,
      body: { categoryId, name: 'Injected', priceMinor: 10_000, foodType: 'veg' },
    });
    expect(create.status).toBe(404);
  });

  it('reads one item and accepts PUT for availability (app compatibility)', async () => {
    const created = await call<{ id: string }>(ctx, 'POST', `/partner/branches/${branchId}/menu/items`, {
      token: owner.token,
      body: { categoryId, name: 'Masala Dosa', priceMinor: 12_000, foodType: 'veg' },
    });
    const itemUrl = `/partner/branches/${branchId}/menu/items/${created.body.id}`;

    const item = await call<{ id: string; name: string; isAvailable: boolean }>(ctx, 'GET', itemUrl, { token: owner.token });
    expect(item.status).toBe(200);
    expect(item.body).toMatchObject({ id: created.body.id, name: 'Masala Dosa', isAvailable: true });
    expect((await call(ctx, 'GET', `/partner/branches/${branchId}/menu/items/${branchId}`, { token: owner.token })).status).toBe(404);
    expect((await call(ctx, 'GET', `/partner/branches/${branchId}/menu/items/not-a-uuid`, { token: owner.token })).status).toBe(422);

    const off = await call<{ isAvailable: boolean }>(ctx, 'PUT', `${itemUrl}/availability`, {
      token: owner.token,
      body: { isAvailable: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.isAvailable).toBe(false);
    expect((await call<{ isAvailable: boolean }>(ctx, 'GET', itemUrl, { token: owner.token })).body.isAvailable).toBe(false);
    expect((await call(ctx, 'PUT', `${itemUrl}/availability`, { token: owner.token, body: {} })).status).toBe(422);

    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId, { name: 'Elsewhere Too' });
    expect((await call(ctx, 'GET', itemUrl, { token: intruder.token })).status).toBe(404);
    expect(
      (await call(ctx, 'PUT', `${itemUrl}/availability`, { token: intruder.token, body: { isAvailable: true } })).status,
    ).toBe(404);
    expect((await call(ctx, 'GET', itemUrl)).status).toBe(401);
    expect((await call(ctx, 'PUT', `${itemUrl}/availability`, { body: { isAvailable: true } })).status).toBe(401);
  });

  it('renames and deactivates categories', async () => {
    const res = await call<MenuBody>(
      ctx,
      'PATCH',
      `/partner/branches/${branchId}/menu/categories/${categoryId}`,
      {
        token: owner.token,
        body: { name: 'Small plates' },
      },
    );
    expect(res.body.categories.find((c) => c.id === categoryId)?.name).toBe('Small plates');
  });
});
