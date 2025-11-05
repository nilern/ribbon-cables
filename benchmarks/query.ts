import {Suite} from 'bench-node';

import * as vec from '../lib/vecnal.js';
import {Vecnal, IndexedSubscriber} from '../lib/vecnal.js';

import * as sig from '../lib/signal.js';
import {Signal, Subscriber} from '../lib/signal.js';
import type {Reset} from '../lib/prelude.js';
import {ImmArrayAdapter, eq} from '../lib/prelude.js';

const suite = new Suite();

const firstnames = [
    'Maria',
    'Helena',
    'Johanna',
    'Anneli',
    'Kaarina',
    'Anna',
    'Marjatta',
    'Liisa',
    'Sofia',
    'Annikki',
    'Juhani',
    'Johannes',
    'Olavi',
    'Antero',
    'Tapani',
    'Kalevi',
    'Tapio',
    'Mikael',
    'Matti',
    'Ilmari'
];

const lastnames = [
    'Korhonen',
    'Virtanen',
    'Mäkinen',
    'Nieminen',
    'Mäkelä',
    'Hämäläinen',
    'Laine',
    'Heikkinen',
    'Koskinen',
    'Järvinen'
];

class User {
    readonly bonusProgram: boolean;
    readonly bonusPoints: number;

    constructor(
        readonly firstname: string,
        readonly lastname: string
    ) {
        this.bonusProgram = firstname.includes('e');
        this.bonusPoints = this.bonusProgram ? lastname.length : 0;
    }
    
    fullname(): string { return this.firstname + ' ' + this.lastname; }
    
    withFirstname(newFirstname: string): User {
        return new User(newFirstname, this.lastname);
    }
}

function compareUsersByName(user1: User, user2: User): number {
    const ordering = user1.lastname.localeCompare(user2.lastname);
    return ordering !== 0 ? ordering : user1.firstname.localeCompare(user2.firstname);
}

const initialUsers: readonly User[] = firstnames.reduce<User[]>((users, firstname) =>
    lastnames.reduce((users, lastname) => {
        users.push(new User(firstname, lastname));
        return users;
    }, users),
    []
);

const userS: Signal<readonly User[]> & Reset<readonly User[]> =
    sig.source(eq, initialUsers);
const userZ: Vecnal<User> = (() => {
    const adaptedUserS = userS.map<ImmArrayAdapter<User>>(eq, (users) =>
        new ImmArrayAdapter(users)
    );
    return vec.imux(eq, adaptedUserS);
})();

/* Approximately
```
select firstname + ' ' + lastname
from users
where bonusProgram
order by lastname, firstname
limit 10 offset 30;
```
*/

function bonusUserFullnameS(userS: Signal<readonly User[]>): Signal<readonly string[]> {
    return userS
        .map<readonly User[]>(eq, (users) => users.filter((user) => user.bonusProgram))
        .map<readonly User[]>(eq, (users) => {
            const users_ = [...users];
            users_.sort(compareUsersByName);
            return users_;
        })
        .map<readonly string[]>(eq, (users) => users.map((user) => user.fullname()))
        .map(eq, (fullnames) => fullnames.slice(30, 40));
}

function bonusUserFullnameZ(userZ: Vecnal<User>): Vecnal<string> {
    return userZ
        .filter((user) => user.bonusProgram)
        .sort(compareUsersByName)
        .map<string>(eq, (user) => user.fullname())
        .slice(30, 40);
}

suite.add('Initialize page signal of bonus user fullnames', (timer) => {
    timer!.start();
    const nameS = bonusUserFullnameS(userS);
    // Figure out changes like we would have to in order to minimize DOM manipulations:
    const nameZ = vec.imux(eq,
        nameS.map<ImmArrayAdapter<string>>(eq, (names) => new ImmArrayAdapter(names)));
    const subscriber: IndexedSubscriber<string> = {
        onInsert: (_, _1) => {},
        onRemove: (_) => {},
        onSubstitute: (_, _1) => {}
    };
    nameZ.addISubscriber(subscriber); // Force actual init
    timer!.end();
    
    nameZ.removeISubscriber(subscriber);
});
suite.add('Initialize page vecnal of bonus user fullnames', (timer) => {
    timer!.start();
    const nameZ = bonusUserFullnameZ(userZ);
    const subscriber: IndexedSubscriber<string> = {
        onInsert: (_, _1) => {},
        onRemove: (_) => {},
        onSubstitute: (_, _1) => {}
    };
    nameZ.addISubscriber(subscriber); // Force actual init
    timer!.end();
    
    nameZ.removeISubscriber(subscriber);
});

let updateeIndex = 0;

suite.add('Update user in page signal of bonus user fullnames', (timer) => {
    const nameS = bonusUserFullnameS(userS);
    // Figure out changes like we would have to in order to minimize DOM manipulations:
    const nameZ = vec.imux(eq,
        nameS.map<ImmArrayAdapter<string>>(eq, (names) => new ImmArrayAdapter(names)));
    const subscriber: IndexedSubscriber<string> = {
        onInsert: (_, _1) => {},
        onRemove: (_) => {},
        onSubstitute: (_, _1) => {}
    };
    nameZ.addISubscriber(subscriber); // Force actual init
    
    timer!.start();
    const newUsers = [...userS.ref()];
    newUsers[updateeIndex] = newUsers[updateeIndex].withFirstname('Marie');
    userS.reset(newUsers);
    timer!.end();
    
    nameZ.removeISubscriber(subscriber);
    userS.reset(initialUsers);
    updateeIndex = (updateeIndex + 17) % userS.ref().length;
});
suite.add('Update user in page vecnal of bonus user fullnames', (timer) => {
    const nameZ = bonusUserFullnameZ(userZ);
    const subscriber: IndexedSubscriber<string> = {
        onInsert: (_, _1) => {},
        onRemove: (_) => {},
        onSubstitute: (_, _1) => {}
    };
    nameZ.addISubscriber(subscriber);
    
    timer!.start();
    const newUsers = [...userS.ref()];
    newUsers[updateeIndex] = newUsers[updateeIndex].withFirstname('Marie');
    userS.reset(newUsers);
    timer!.end();
    
    nameZ.removeISubscriber(subscriber);
    userS.reset(initialUsers);
    updateeIndex = (updateeIndex + 17) % userS.ref().length;
});

/* Approximately
```
select sum(bonusPoints)
from users
where bonusProgram;
```
*/

function totalBonusPointsSigd(userS: Signal<readonly User[]>): Signal<number> {
    return userS
        .map<readonly User[]>(eq, (users) => users.filter((user) => user.bonusProgram))
        .map<readonly number[]>(eq, (users) => users.map((user) => user.bonusPoints))
        .map(eq, (usersPoints) => usersPoints.reduce(
            (total, userPoints) => total + userPoints,
            0
        ));
}

function totalBonusPointsVecd(userZ: Vecnal<User>): Signal<number> {
    return userZ
        .filter((user) => user.bonusProgram)
        .map<number>(eq, (user) => user.bonusPoints)
        .reduceS(
            eq, 
            (total, userPoints) => total + userPoints,
            sig.stable(0)
        );
}

suite.add('Initialize total bonus points via signals', (timer) => {
    timer!.start();
    const totalS = totalBonusPointsSigd(userS);
    const subscriber: Subscriber<number> = {onChange: (_) => {}};
    totalS.addSubscriber(subscriber); // Force actual init
    timer!.end();
    
    totalS.removeSubscriber(subscriber);
});
suite.add('Initialize total bonus points via vecnals', (timer) => {
    timer!.start();
    const totalS = totalBonusPointsVecd(userZ);
    const subscriber: Subscriber<number> = {onChange: (_) => {}};
    totalS.addSubscriber(subscriber); // Force actual init
    timer!.end();
    
    totalS.removeSubscriber(subscriber);
});

const theTotalBonusPointsSigd = totalBonusPointsSigd(userS);
const theTotalBonusPointsVecd = totalBonusPointsVecd(userZ);
let sumUpdateeIndex = 0;

suite.add('Update user in total bonus points via signals', (timer) => {
    const subscriber: Subscriber<number> = {onChange: (_) => {}};
    theTotalBonusPointsSigd.addSubscriber(subscriber);
    
    timer!.start();
    const newUsers = [...userS.ref()];
    newUsers[updateeIndex] = newUsers[updateeIndex].withFirstname('Marie');
    userS.reset(newUsers);
    timer!.end();
    
    theTotalBonusPointsSigd.removeSubscriber(subscriber);
    userS.reset(initialUsers);
    sumUpdateeIndex = (sumUpdateeIndex + 17) % userS.ref().length;
});

suite.add('Update user in total bonus points via vecnals', (timer) => {
    const subscriber: Subscriber<number> = {onChange: (_) => {}};
    theTotalBonusPointsVecd.addSubscriber(subscriber);
    
    timer!.start();
    const newUsers = [...userS.ref()];
    newUsers[updateeIndex] = newUsers[updateeIndex].withFirstname('Marie');
    userS.reset(newUsers);
    timer!.end();
    
    theTotalBonusPointsVecd.removeSubscriber(subscriber);
    userS.reset(initialUsers);
    sumUpdateeIndex = (sumUpdateeIndex + 17) % userS.ref().length;
});

suite.run()

