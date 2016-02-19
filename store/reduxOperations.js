import {ActionTypes} from 'redux/lib/createStore';
const {INIT} = ActionTypes;
var INIT_ACTION = { type: '@@INIT' };

export const walkState = (locationStack, state) => {
  return locationStack.reduce((reduction, key, currentIdx) => {
    if (!reduction[key]) {
      reduction[key] = (currentIdx === locationStack.length - 1) ? undefined : {};
    }
    return reduction[key];
  }, state);
};

const appendChangeToState = (locationStack, state, newSubState) => {
  if (locationStack.length === 1) {
    return Object.assign({}, state, {[locationStack[0]]: newSubState});
  } else {
    const subObject = appendChangeToState(locationStack.slice(1), state[locationStack[0]], newSubState);
    return Object.assign({}, state, {[locationStack[0]]: subObject});
  }
};

const makeStoreOperations = (storeOperations, state, stack = [], key) => {
  if (typeof  state === 'object' && state.signature === '@@reduxOperations') {
    Object.keys(state).filter(key => key !== 'signature').forEach(operation => {
      storeOperations[operation] = storeOperations[operation] || {};
      storeOperations[operation].operationArray = storeOperations[operation].operationArray || [];
      storeOperations[operation].operationArray.push({...state[operation], defaultLocation: [...stack], name: key})
    })
  } else {
    Object.keys(state).forEach(key => {
      stack.push(key);
      makeStoreOperations(storeOperations, state[key], stack, key);
    })
  }
  stack.pop();
};

function liftReducerWith(reducer, initialCommittedState, monitorReducer) {
  const initialLiftedState = {
    api: {},
    userState: initialCommittedState
  };

  /**
   * Manages how the history actions modify the history state.
   */
  return (liftedState = initialLiftedState, liftedAction) => {
    let {api,userState} = liftedState;
    let activeState = reducer(userState, liftedAction);
    if (liftedAction.type === INIT || liftedAction.type === INIT_ACTION.type) {
      const qlInit = {type: 'INITQL'};
      debugger
      const initResult = reducer(undefined, qlInit);
      api = {};
      makeStoreOperations(api, initResult);
    }
    else {
      debugger
      const actionObject = api[liftedAction.type] || {};
      const operationArray = actionObject.operationArray;
      if (operationArray) {
        operationArray.forEach(operation => {
          let locationStack = operation.defaultLocation;
          // 3 possiblies: If a locationStack isn't given, use the default (for simple non-multi scenarios)
          // If Loc but no Name, or name == operation name, use given location (for dynamic or multi scenarios)
          // Otherwise, use default
          if (liftedAction.meta.location && (!liftedAction.meta.name || operation.name === liftedAction.meta.name)) {
            locationStack = liftedAction.meta.location
          }
          const subState = walkState(locationStack, activeState);
          const newSubState = operation.reducer(subState, liftedAction);
          if (subState !== newSubState) {
            activeState = appendChangeToState(locationStack, activeState, newSubState);
          }
          liftedAction.meta.operationResults = liftedAction.meta.operationResults || {};
          liftedAction.meta.operationResults[operation.name] = {oldState: subState, state: newSubState};
        })
      }
    }
    return {
      api,
      userState: activeState
    }
  };
}

function unliftState(liftedState) {
  return liftedState.userState;
}

function unliftStore(reduxOperationStore, liftReducer) {
  return {
    ...reduxOperationStore,

    reduxOperationStore,

    dispatch(action) {
      action.meta = action.meta || {};
      action.meta.dispatch = reduxOperationStore.dispatch;
      reduxOperationStore.dispatch(action);
      return action;
    },

    getState() {
      return unliftState(reduxOperationStore.getState());
    },

    replaceReducer(nextReducer) {
      reduxOperationStore.replaceReducer(liftReducer(nextReducer));
    }
  };
}

export default function instrument() {
  return createStore => (reducer, initialState, enhancer) => {
    debugger
    function liftReducer(r) {
      if (typeof r !== 'function') {
        if (r && typeof r.default === 'function') {
          throw new Error(
            'Expected the reducer to be a function. ' +
            'Instead got an object with a "default" field. ' +
            'Did you pass a module instead of the default export? ' +
            'Try passing require(...).default instead.'
          );
        }
        throw new Error('Expected the reducer to be a function.');
      }
      return liftReducerWith(r, initialState);
    }

    const reduxOperationStore = createStore(liftReducer(reducer), enhancer);
    if (reduxOperationStore.reduxOperationStore) {
      throw new Error(
        'DevTools instrumentation should not be applied more than once. ' +
        'Check your store configuration.'
      );
    }

    return unliftStore(reduxOperationStore, liftReducer);
  };
}
