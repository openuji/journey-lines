import en from './en.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };

export const dictionaries = Object.freeze({
  en: Object.freeze({ ...en }),
  de: Object.freeze({ ...de }),
});
