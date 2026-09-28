export const emptyPlayer = { track: null, queue: [], status: 'idle', revision: 0 };
export function playerReducer(state, action) {
  switch (action.type) {
    case 'select': return { ...state, track: action.track, status: 'loading', revision: state.revision + 1 };
    case 'add': return { ...state, queue: [...state.queue, action.track] };
    case 'remove': return { ...state, queue: state.queue.filter((_, i) => i !== action.index) };
    case 'clear': return { ...state, queue: [] };
    case 'next':
    case 'ended':
      if (!state.queue.length) return action.type === 'next' ? state : { ...state, status: 'ended' };
      return { ...state, track: state.queue[0], queue: state.queue.slice(1), status: 'loading', revision: state.revision + 1 };
    case 'status': return { ...state, status: action.status };
    default: return state;
  }
}

export function clampPosition(position, width, height, viewportWidth, viewportHeight) {
  return {
    x: Math.max(8, Math.min(viewportWidth - width - 8, Number(position.x) || 8)),
    y: Math.max(8, Math.min(viewportHeight - height - 8, Number(position.y) || 8)),
  };
}

export const remainingSeconds = (deadline, now = Date.now()) => Math.max(0, Math.ceil((deadline - now) / 1000));
