// How many of your own mistakes are due for practice.
import { useEffect, useState } from 'react';
import { listPuzzles, onDbChange } from '../lib/storage/db';

export function usePracticeDue() {
  const [due, setDue] = useState(0);
  useEffect(() => {
    const load = () => void listPuzzles().then((ps) => setDue(ps.filter((p) => p.due <= Date.now()).length));
    load();
    return onDbChange(load);
  }, []);
  return due;
}
