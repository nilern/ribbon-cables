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

