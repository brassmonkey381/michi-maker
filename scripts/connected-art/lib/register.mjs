/** Registers the tcgscan-app alias resolver. See tcgscan-hook.mjs for why. */
import { register } from 'node:module';

register('./tcgscan-hook.mjs', import.meta.url);
