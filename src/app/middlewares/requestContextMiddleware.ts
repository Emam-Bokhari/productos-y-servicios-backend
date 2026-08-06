import { Request, Response, NextFunction } from "express";
import { runWithContext } from "../../shared/requestContext";

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  runWithContext({ googleRouteCache: new Map() }, () => {
    next();
  });
};
