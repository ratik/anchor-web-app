import { borrowAPYQuery } from '../apy';

describe('queries/borrowAPY', () => {
  test('should get result from query', async () => {
    const { borrowerDistributionAPYs, lpRewards, govRewards } =
      await borrowAPYQuery();

    expect(Array.isArray(borrowerDistributionAPYs)).toBeTruthy();
    expect(Array.isArray(govRewards)).toBeTruthy();
    expect(Array.isArray(lpRewards)).toBeTruthy();
  });
});
