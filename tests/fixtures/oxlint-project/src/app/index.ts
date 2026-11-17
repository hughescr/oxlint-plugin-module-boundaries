import { AppError } from '@/errors';
import { util } from '@/utils';
import { helper } from '../utils/helper';
import { nested } from '@/utils/nested';
import { internalThing } from '@/utils';

export type Start = () => number;

export const start: Start = () => {
    if(util < 0) {
        throw new AppError();
    }
    return util + helper + nested + internalThing;
};
