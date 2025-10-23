import {Suite} from 'bench-node';

import * as vec from '../js/vecnal.js';
import {Vecnal} from '../js/vecnal.js';

import * as sig from '../js/signal.js';
import {Signal} from '../js/signal.js';
import {ImmArrayAdapter, eq} from '../js/prelude.js';

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

const userS: Signal<readonly User[]> = sig.stable(initialUsers);
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
suite.add('Initialize page signal of bonus user fullnames', () => {
    userS
        .map<readonly User[]>(eq, (users) => users.filter((user) => user.bonusProgram))
        .map<readonly User[]>(eq, (users) => {
            const users_ = [...users];
            users_.sort(compareUsersByName);
            return users_;
        })
        .map<readonly string[]>(eq, (users) => users.map((user) => user.fullname()))
        .map(eq, (fullnames) => fullnames.slice(30, 40));
});
suite.add('Initialize page vecnal of bonus user fullnames', () => {
    userZ
        .filter((user) => user.bonusProgram)
        .sort(compareUsersByName)
        .map(eq, (user) => user.fullname())
        .slice(30, 40);
});

/* Approximately
```
select sum(bonusPoints)
from users
where bonusProgram;
```
*/
suite.add('Initialize total bonus points via signals', () => {
    userS
        .map<readonly User[]>(eq, (users) => users.filter((user) => user.bonusProgram))
        .map<readonly number[]>(eq, (users) => users.map((user) => user.bonusPoints))
        .map(eq, (usersPoints) => usersPoints.reduce(
            (total, userPoints) => total + userPoints,
            0
        ));
});
suite.add('Initialize total bonus points via vecnals', () => {
    userZ
        .filter((user) => user.bonusProgram)
        .map<number>(eq, (user) => user.bonusPoints)
        .reduceS(
            eq, 
            (total, userPoints) => total + userPoints,
            sig.stable(0)
        );
});

suite.run()

