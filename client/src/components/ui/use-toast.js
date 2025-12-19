// Adapted from Shadcn UI's use-toast.ts but simplified for JS and no Radix dependency

import * as React from "react"

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 1000000

let count = 0

function genId() {
    count = (count + 1) % Number.MAX_SAFE_INTEGER
    return count.toString()
}

const actionTypes = {
    ADD_TOAST: "ADD_TOAST",
    UPDATE_TOAST: "UPDATE_TOAST",
    DISMISS_TOAST: "DISMISS_TOAST",
    REMOVE_TOAST: "REMOVE_TOAST",
}

let memoryState = { toasts: [] }
const listeners = []

function dispatch(action) {
    memoryState = reducer(memoryState, action)
    listeners.forEach((listener) => {
        listener(memoryState)
    })
}

function reducer(state, action) {
    switch (action.type) {
        case actionTypes.ADD_TOAST:
            return {
                ...state,
                toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
            }

        case actionTypes.UPDATE_TOAST:
            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === action.toast.id ? { ...t, ...action.toast } : t
                ),
            }

        case actionTypes.DISMISS_TOAST: {
            const { toastId } = action

            // Dismiss all if no id
            if (toastId === undefined) {
                return {
                    ...state,
                    toasts: state.toasts.map((t) => ({
                        ...t,
                        open: false,
                    })),
                }
            }

            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === toastId || toastId === undefined
                        ? {
                            ...t,
                            open: false,
                        }
                        : t
                ),
            }
        }
        case actionTypes.REMOVE_TOAST:
            if (action.toastId === undefined) {
                return {
                    ...state,
                    toasts: [],
                }
            }
            return {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.toastId),
            }
        default:
            return state
    }
}

function toast({ title, description, variant = "default", duration = 5000, ...props }) {
    const id = genId()

    const update = (props) =>
        dispatch({
            type: actionTypes.UPDATE_TOAST,
            toast: { ...props, id },
        })

    const dismiss = () => dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id })

    dispatch({
        type: actionTypes.ADD_TOAST,
        toast: {
            id,
            title,
            description,
            variant,
            open: true,
            onOpenChange: (open) => {
                if (!open) dismiss()
            },
            duration,
            ...props,
        },
    })

    // Auto dismiss
    if (duration !== Infinity) {
        setTimeout(() => {
            dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id })
        }, duration)
    }

    // Auto remove after dismiss (for animation time)
    setTimeout(() => {
        dispatch({ type: actionTypes.REMOVE_TOAST, toastId: id })
    }, duration + 1000)

    return {
        id,
        dismiss,
        update,
    }
}

function useToast() {
    const [state, setState] = React.useState(memoryState)

    React.useEffect(() => {
        listeners.push(setState)
        return () => {
            const index = listeners.indexOf(setState)
            if (index > -1) {
                listeners.splice(index, 1)
            }
        }
    }, [state])

    return {
        ...state,
        toast,
        dismiss: (toastId) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
    }
}

export { useToast, toast }
