import type { FurnitureDef } from '../types';
import { PUBLIC_SCHOOL } from './_public_school';
import { PUBLIC_SHOP } from './_public_shop';
import { PUBLIC_CAFE } from './_public_cafe';
import { PUBLIC_MISC } from './_public_misc';

/** Interiors of public buildings: school, kindergarten, shop, café, library. */
export const PUBLIC: FurnitureDef[] = [...PUBLIC_SCHOOL, ...PUBLIC_SHOP, ...PUBLIC_CAFE, ...PUBLIC_MISC];
