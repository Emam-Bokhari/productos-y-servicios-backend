import { AsyncLocalStorage } from "async_hooks";

export interface IRequestContext {
  googleRouteCache?: Map<string, any>;
}

export const requestContext = new AsyncLocalStorage<IRequestContext>();

export const runWithContext = <T>(context: IRequestContext, fn: () => T): T => {
  return requestContext.run(context, fn);
};

export const getContext = (): IRequestContext | undefined => {
  return requestContext.getStore();
};
