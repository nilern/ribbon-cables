import {stable} from "../js/signal";

describe('testing `stable`', () => {
  test('ref()', () => {
    const answerS = stable(42);
    expect(answerS.ref()).toBe(42);
  });
});

