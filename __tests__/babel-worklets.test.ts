/**
 * Reanimated's Babel plugin is what turns a `'worklet'` function into something
 * that can run on the UI thread; without it Reanimated silently does not work.
 *
 * Jest transforms this file through the same `babel.config.js` Metro uses, so
 * declaring a worklet here and inspecting what the transform produced is a
 * direct check of the wiring: remove the plugin from `babel.config.js` and this
 * fails.
 */
describe('babel worklets plugin', () => {
  it('compiles a worklet into a workletised function', () => {
    const grow = () => {
      'worklet';
      return 42;
    };

    // `__workletHash` and `__initData` are added by the plugin, never by hand.
    const workletised = grow as typeof grow & {
      __workletHash?: number;
      __initData?: { code: string };
    };

    expect(typeof workletised.__workletHash).toBe('number');
    expect(workletised.__initData?.code).toContain('42');
    expect(grow()).toBe(42);
  });
});
