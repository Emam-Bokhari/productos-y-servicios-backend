import express, { Application, Request, Response } from "express";
import cors from "cors";
import { StatusCodes } from "http-status-codes";
import { Morgan } from "./shared/morgan";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import path from "path";
import swaggerUi from "swagger-ui-express";
import yaml from "yamljs";
import router from "./app/routes";
import { StripeControllers } from "./app/modules/stripe/stripe.controller";
import { requestContextMiddleware } from "./app/middlewares/requestContextMiddleware";

const app: Application = express();

app.use(requestContextMiddleware);

app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");

// morgan
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

//body parser
app.use(
  cors({
    origin: ["http://10.10.7.46:3011", "http://10.10.7.46:3015", "http://localhost:5173","http://localhost:5174"],
    credentials: true,
  }),
);

// Stripe Webhook Endpoint (Needs raw body parser BEFORE express.json())
app.post(
  "/api/v1/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    (req as any).rawBody = req.body;
    next();
  },
  StripeControllers.handleWebhook,
);

app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: true }));

//file retrieve
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// swagger docs
try {
  const swaggerDocument = yaml.load(
    path.join(__dirname, "..", "docs", "swagger", "index.yaml"),
  );
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  console.log(
    "Swagger documentation file not found. Skipping swagger UI setup.",
  );
}

//router
app.use("/api/v1", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Server is running...");
});

// handle not found route
app.use((req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Not Found",
    errorMessages: [
      {
        path: req.originalUrl,
        message: "API DOESN'T EXIST",
      },
    ],
  });
});

//global error handle
app.use(globalErrorHandler);

export default app;