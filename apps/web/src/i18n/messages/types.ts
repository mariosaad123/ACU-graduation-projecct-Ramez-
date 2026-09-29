import type { ar } from './ar';

type Widen<T> = { [Key in keyof T]: T[Key] extends string ? string : Widen<T[Key]> };

/** Every locale must provide exactly the keys of the Arabic source messages. */
export type Messages = Widen<typeof ar>;
