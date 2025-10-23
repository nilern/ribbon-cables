import {Suite} from 'bench-node';

const suite = new Suite();

suite.add('Using delete prop', () => {
  const data: {x?: number, y?: number, z?: number} = { x: 1, y: 2, z: 3 };
  delete data.y;

  data.x;
  data.y;
  data.z;
});

suite.run()

