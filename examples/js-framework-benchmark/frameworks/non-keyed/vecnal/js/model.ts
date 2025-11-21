export {Datum, Model};

function randNat(max: number) { return Math.floor(Math.random() * max); }

const adjectives: readonly string[] = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];

const colours: readonly string[] = [
    "red",
    "yellow",
    "blue",
    "green",
    "pink",
    "brown",
    "purple",
    "brown",
    "white",
    "black",
    "orange"
];

const nouns: readonly string[] = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

function randLabel(): string {
    return adjectives[randNat(adjectives.length)] + " " +
        colours[randNat(colours.length)] + " " +
        nouns[randNat(nouns.length)];
}

class Datum {
    constructor(
        public readonly id: number,
        public readonly label: string
    ) {}
    
    withLabel(label: string): Datum { return new Datum(this.id, label); }
}

class Model {
    constructor(
        public readonly lastId: number = 0,
        public readonly data: readonly Datum[] = []
    ) {}
    
    rebuild(count: number): Model {
        let lastId = this.lastId;
        const data = new Array(count);
        
        for (let i = 0; i < count; ++i) {
            data[i] = new Datum(++lastId, randLabel());
        }
        
        return new Model(lastId, data);
    }
    
    append(count: number): Model {
        let lastId = this.lastId;
        const data = [...this.data];
        const oldLen = this.data.length;
        const len = data.length = oldLen + count;
        
        for (let i = oldLen; i < len; ++i) {
            data[i] = new Datum(++lastId, randLabel());
        }
        
        return new Model(lastId, data);
    }
    
    updateNth(stride: number): Model {
        const data = [...this.data];
        
        const len = data.length;
        for (let i = 0; i < len; i += stride) {
            const datum = data[i];
            data[i] = datum.withLabel(datum.label + " !!!"); // OPTIMIZE
        }
        
        return new Model(this.lastId, data);
    }
    
    clear(): Model { return new Model(this.lastId); }
    
    swapRows(): Model {
        const data = (() => {
            if (this.data.length > 998) {
                const data = [...this.data];
                
                const datum1 = data[1];
                data[1] = data[998];
                data[998] = datum1;
                
                return data;
            } else {
                return this.data;
            }
        })();
    
        return new Model(this.lastId, data);
    }
    
    withoutRow(id: number): Model {
        return new Model(
            this.lastId,
            this.data.filter((datum) => datum.id !== id)
        );
    }
}

