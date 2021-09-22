interface Measurer<Measure, Data> {
    identity(): Measure
    measure(value: Data): Measure
    sum(m1: Measure, m2: Measure): Measure
}

export declare class FingerTree<Measure, Data> {
    static fromArray<Measure, Data>(contents: Data[], measurer: Measurer<Measure, Data>): FingerTree<Measure, Data>

    measure(): Measure
    split(measurer: (m: Measure)=> any): [FingerTree<Measure, Data>, FingerTree<Measure, Data>]
    peekFirst(): Data
    addFirst(Data): FingerTree<Measure, Data>;
    isEmpty(): boolean
    removeFirst(): FingerTree<Measure, Data>;
}
