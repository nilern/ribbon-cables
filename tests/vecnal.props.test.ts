import type {Arb} from 'fast-check';
import {test as tst, fc} from '@fast-check/jest';

import * as vec from '../js/vecnal.js';

import * as sig from '../js/signal.js';
import {eq, ImmArrayAdapter} from '../js/prelude.js';

const maxLength = 100;

type Insertion = {
    name: 'insert',
    index: number,
    username: string
};

type Removal = {
    name: 'remove',
    index: number
};

type Substitution = {
    name: 'substitute',
    index: number,
    username: string
};

type Op = Insertion | Removal | Substitution;

const arbOp: Arb<Op> = fc.oneof(
    fc.record({
        'name': fc.constant('insert'),
        'index': fc.nat(maxLength),
        'username': fc.string()
    }),
    fc.record({
        'name': fc.constant('remove'),
        'index': fc.nat(maxLength)
    }),
    fc.record({
        'name': fc.constant('substitute'),
        'index': fc.nat(maxLength),
        'username': fc.string()
    })
);

class User {
    constructor(
        public readonly id: number,
        public username: string
    ) {}
    
    eq(that: User): boolean { return this.id === that.id; }
}

function compareUsernames(user1: User, user2: User): number {
    return user1.username.localeCompare(user2.username);
}

function inc(n: number): number { return n + 1; }

tst.prop({nats: fc.array(fc.nat())})(
    '`map` output is input elements transformed',
    ({nats}) => {
        const natS = vec.stable(nats);
        const nattieS = natS.map(eq, inc);
        
        const vecnalNatties = nattieS.reduce((acc, n) => {
            acc.push(n);
            return acc;
        }, []);
        const natties = nats.map(inc);
        
        expect(vecnalNatties).toEqual(natties);
    }
);

tst.prop({nats: fc.array(fc.nat(), {maxLength}), ops: fc.array(arbOp)})(
    '`map` output after input modifications is still input elements transformed',
    ({nats, ops}) => {
        const natS = vec.source(eq, nats);
        const nattieS = natS.map(eq, inc);
        nattieS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const op of ops) {
            switch (op.name) {
            case 'insert':
                if (op.index <= natS.size()) {
                    natS.insert(op.index, /* HACK: */ op.username.length);
                }
                break;
            
            case 'remove':
                if (op.index < natS.size()) {
                    natS.remove(op.index);
                }
                break;
            
            case 'substitute':
                if (op.index < natS.size()) {
                    natS.setAt(op.index, /* HACK: */ op.username.length);
                }
                break;
            
            default: { const _exhaust: never = op.name; }
            }
        }
        
        const vecnalNatties = nattieS.reduce((acc, n) => {
            acc.push(n);
            return acc;
        }, []);
        const natties = natS.reduce((acc, n) => {
            acc.push(inc(n));
            return acc;
        }, []);
        
        expect(vecnalNatties).toEqual(natties);
    }
);

tst.prop({usernames: fc.array(fc.string())})(
    '`imux` output is input elements',
    ({usernames}) => {
        const usernameS = sig.stable(new ImmArrayAdapter(usernames));
        const usernameZ = vec.imux(eq, usernameS);
        
        const vecnalUsernames = usernameZ.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        
        expect(vecnalUsernames).toEqual(usernames);
    }
);

tst.prop({usernames: fc.array(fc.string(), {maxLength}), ops: fc.array(arbOp)})(
    '`imux` output after input modifications is still input elements',
    ({usernames, ops}) => {
        const usernameS = sig.source(eq, new ImmArrayAdapter([...usernames]));
        const usernameZ = vec.imux(eq, usernameS);
        usernameZ.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const op of ops) {
            const currentUsernames = usernameS.ref();
        
            switch (op.name) {
            case 'insert':
                if (op.index <= currentUsernames.length) {
                    const newUsernames = [...currentUsernames];
                    newUsernames.splice(op.index, 0, op.username);
                    usernameS.reset(new ImmArrayAdapter(newUsernames));
                }
                break;
            
            case 'remove':
                if (op.index < currentUsernames.length) {
                    const newUsernames = [...currentUsernames];
                    newUsernames.splice(op.index, 1);
                    usernameS.reset(new ImmArrayAdapter(newUsernames));
                }
                break;
            
            case 'substitute':
                if (op.index < currentUsernames.length) {
                    const newUsernames = [...currentUsernames];
                    newUsernames[op.index] = op.username;
                    usernameS.reset(new ImmArrayAdapter(newUsernames));
                }
                break;
            
            default: { const _exhaust: never = op.name; }
            }
        }
        
        const vecnalUsernames = usernameZ.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        
        expect(vecnalUsernames).toEqual(usernames);
    }
);

tst.prop({inputs: fc.array(fc.array(fc.string()))})(
    '`concat` output is elements of inputs',
    ({inputs}) => {
        const inputVecnals = inputs.map(vec.stable);
        const catenated = vec.concat.apply(undefined, inputVecnals);
        
        const catVals = catenated.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        const vals = inputs.flat();
        
        expect(catVals).toEqual(vals);
    }
);

const arbCatOp = fc.tuple(fc.nat(maxLength), arbOp);

tst.prop({
    inputs: fc.array(fc.array(fc.string(), {maxLength}, {maxLength})),
    ops: fc.array(arbCatOp)
})(
    '`concat` output after input modifications is still input reversed',
    ({inputs, ops}) => {
        const inputVecnals = inputs.map((input) => vec.source(eq, input));
        const catenated = vec.concat.apply(undefined, inputVecnals);
        catenated.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const [i, op] of ops) {
            if (i < inputVecnals.length) {
                const input = inputVecnals[i];
            
                switch (op.name) {
                case 'insert':
                    if (op.index <= input.size()) {
                        input.insert(op.index, op.username);
                    }
                    break;
                
                case 'remove':
                    if (op.index < input.size()) {
                        input.remove(op.index);
                    }
                    break;
                
                case 'substitute':
                    if (op.index < input.size()) {
                        input.setAt(op.index, op.username);
                    }
                    break;
                
                default: { const _exhaust: never = op.name; }
                }
            }
        }
        
        const catVals = catenated.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        const vals = inputVecnals.flatMap((input) => input.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []));
        
        expect(catVals).toEqual(vals);
    }
);

function isOdd(n: number): boolean { return n % 2 === 1; }

tst.prop({nats: fc.array(fc.nat())})(
    '`filter` output is valid elements of input',
    ({nats}) => {
        const natS = vec.stable(nats);
        const oddS = natS.filter(isOdd);
        
        const vecnalOdds = oddS.reduce((acc, n) => {
            acc.push(n);
            return acc;
        }, []);
        const odds = nats.filter(isOdd);
        
        expect(vecnalOdds).toEqual(odds);
    }
);

tst.prop({nats: fc.array(fc.nat(), {maxLength}), ops: fc.array(arbOp)})(
    '`filter` output after input modifications is still valid elements of input',
    ({nats, ops}) => {
        const natS = vec.source(eq, nats);
        const oddS = natS.filter(isOdd);
        oddS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const op of ops) {
            switch (op.name) {
            case 'insert':
                if (op.index <= natS.size()) {
                    natS.insert(op.index, op.username.length); // HACK
                }
                break;
            
            case 'remove':
                if (op.index < natS.size()) {
                    natS.remove(op.index);
                }
                break;
            
            case 'substitute':
                if (op.index < natS.size()) {
                    natS.setAt(op.index, op.username.length); // HACK
                }
                break;
            
            default: { const _exhaust: never = op.name; }
            }
        }
        
        const vecnalOdds = oddS.reduce((acc, n) => {
            acc.push(n);
            return acc;
        }, []);
        const odds = natS.reduce((acc, n) => {
            if (isOdd(n)) { acc.push(n); }
            return acc;
        }, []);
        
        expect(vecnalOdds).toEqual(odds);
    }
);

tst.prop({usernames: fc.array(fc.string())})(
    '`reverse` output is input reversed',
    ({usernames}) => {
        const usernameS = vec.stable(usernames);
        const revUsernameS = usernameS.reverse();
        
        const vecnalUsernames = revUsernameS.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        const revUsernames = [...usernames];
        revUsernames.reverse();
        
        expect(vecnalUsernames).toEqual(revUsernames);
    }
);

tst.prop({usernames: fc.array(fc.string(), {maxLength}), ops: fc.array(arbOp)})(
    '`reverse` output after input modifications is still input reversed',
    ({usernames, ops}) => {
        const usernameS = vec.source(eq, usernames);
        const revUsernameS = usernameS.reverse();
        revUsernameS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const op of ops) {
            switch (op.name) {
            case 'insert':
                if (op.index <= usernameS.size()) {
                    usernameS.insert(op.index, op.username);
                }
                break;
            
            case 'remove':
                if (op.index < usernameS.size()) {
                    usernameS.remove(op.index);
                }
                break;
            
            case 'substitute':
                if (op.index < usernameS.size()) {
                    usernameS.setAt(op.index, op.username);
                }
                break;
            
            default: { const _exhaust: never = op.name; }
            }
        }
        
        const vecnalUsernames = revUsernameS.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        const revUsernames = usernameS.reduce((acc, username) => {
            acc.push(username);
            return acc;
        }, []);
        revUsernames.reverse();
        
        expect(vecnalUsernames).toEqual(revUsernames);
    }
);

tst.prop({usernames: fc.array(fc.string())})(
    '`sort` output is input sorted',
    ({usernames}) => {
        const initialUsers = usernames.map((username, id) => new User(id, username));
        
        const userS = vec.source((user1, user2) => user1.eq(user2), initialUsers);
        const sortedUserS = userS.sort(compareUsernames);
        
        const vecnalSorted = sortedUserS.reduce((acc, user) => {
            acc.push(user);
            return acc;
        }, []);
        const arraySorted = [...initialUsers].sort(compareUsernames);
        
        expect(vecnalSorted).toEqual(arraySorted);
    }
);

/* FIXME:
Property failed after 43 tests
    { seed: 328864510, path: "42:4:7:10:13:26:33:20:17:17:17:25:17:20:18:26:17:30:22:26:28:2:17:13:13:24:24:27:26:27:14:12:18:18", endOnFailure: true }
    Counterexample: [{"usernames":["","",""," ",""],"ops":[{"name":"remove","index":3},{"name":"insert","index":4,"username":""}]}]
    Shrunk 33 time(s)

    Hint: Enable verbose mode in order to have the list of all failing values encountered during the run

      at buildError (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:156:19)
      at asyncThrowIfFailed (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:170:11)

    Cause:
    expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

    @@ -10,13 +10,13 @@
        User {
          "id": 2,
          "username": "",
        },
        User {
    -     "id": 4,
    +     "id": 5,
          "username": "",
        },
        User {
    -     "id": 5,
    +     "id": 4,
          "username": "",
        },
      ]

      396 |             .sort(compareUsernames)
      397 |         
    > 398 |         expect(vecnalSorted).toEqual(arraySorted);
          |                              ^
      399 |     }
      400 | );
*/
tst.prop({usernames: fc.array(fc.string(), {maxLength}), ops: fc.array(arbOp)})(
    '`sort` output after input modifications is still input sorted',
    ({usernames, ops}) => {
        const initialUsers = usernames.map((username, id) => new User(id, username));
        let currentId = initialUsers.length;
        
        const userS = vec.source((user1, user2) => user1.eq(user2), initialUsers);
        const sortedUserS = userS.sort(compareUsernames);
        sortedUserS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        for (const op of ops) {
            switch (op.name) {
            case 'insert':
                if (op.index <= userS.size()) {
                    userS.insert(op.index, new User(currentId++, op.username));
                }
                break;
            
            case 'remove':
                if (op.index < userS.size()) {
                    userS.remove(op.index);
                }
                break;
            
            case 'substitute':
                if (op.index < userS.size()) {
                    userS.setAt(op.index, new User(currentId++, op.username));
                }
                break;
            
            default: { const _exhaust: never = op.name; }
            }
        }
        
        const vecnalSorted = sortedUserS.reduce((acc, user) => {
            acc.push(user);
            return acc;
        }, []);
        const arraySorted = userS.reduce((acc, user) => {
                acc.push(user);
                return acc;
            }, [])
            .sort(compareUsernames)
        
        expect(vecnalSorted).toEqual(arraySorted);
    }
);

