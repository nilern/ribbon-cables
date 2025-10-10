import type {Arb} from 'fast-check';
import {test as tst, fc} from '@fast-check/jest';

import * as vec from '../js/vecnal.js';

const maxLength = 100;

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
    'output is input sorted',
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

tst.prop({usernames: fc.array(fc.string(), {maxLength}), ops: fc.array(arbOp)})(
    'output after input modifications is still input sorted',
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

