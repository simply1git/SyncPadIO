import { useState, useCallback } from 'react';

export interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialValue: T) {
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initialValue,
    future: [],
  });

  const set = useCallback((newPresent: T) => {
    setState(prevState => ({
      past: [...prevState.past, prevState.present],
      present: newPresent,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState(prevState => {
      if (prevState.past.length === 0) return prevState;
      
      const newPast = prevState.past.slice(0, -1);
      const newPresent = prevState.past[prevState.past.length - 1];
      
      return {
        past: newPast,
        present: newPresent,
        future: [prevState.present, ...prevState.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState(prevState => {
      if (prevState.future.length === 0) return prevState;
      
      const newPresent = prevState.future[0];
      const newFuture = prevState.future.slice(1);
      
      return {
        past: [...prevState.past, prevState.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  return {
    value: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
