import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import type { SubscriptionService } from '../modules/subscriptions/services/subscription.service';
import { Logger } from '../lib/logger/logger';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../lib/errors/app.error';

interface SubscribeRequest {
  email: string;
  repository: string;
}

interface SubscribeResponse {
  status: string;
  message: string;
  test_token?: string;
}

interface ConfirmRequest {
  token: string;
}

interface ConfirmResponse {
  status: string;
  message: string;
}

interface UnsubscribeRequest {
  token: string;
}

interface UnsubscribeResponse {
  status: string;
  message: string;
}

interface GetSubscriptionsRequest {
  email: string;
}

interface SubscriptionItem {
  repository: string;
  status: string;
  createdAt: string;
}

interface GetSubscriptionsResponse {
  status: string;
  email: string;
  subscriptions: SubscriptionItem[];
}

type SubscriptionProtoType = grpc.GrpcObject & {
  subscription: {
    SubscriptionService: {
      service: grpc.ServiceDefinition;
    };
  };
};

interface ISubscriptionHandlers extends grpc.UntypedServiceImplementation {
  Subscribe: grpc.handleUnaryCall<SubscribeRequest, SubscribeResponse>;
  Confirm: grpc.handleUnaryCall<ConfirmRequest, ConfirmResponse>;
  Unsubscribe: grpc.handleUnaryCall<UnsubscribeRequest, UnsubscribeResponse>;
  GetSubscriptions: grpc.handleUnaryCall<GetSubscriptionsRequest, GetSubscriptionsResponse>;
}

const PROTO_PATH = path.join(__dirname, './proto/subscription.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(
  packageDefinition,
) as unknown as SubscriptionProtoType;
const subscriptionProto = protoDescriptor.subscription;

const handleGrpcError = <T>(error: unknown, callback: grpc.sendUnaryData<T>) => {
  let code = grpc.status.INTERNAL;
  let message = 'Unknown server error';

  if (error instanceof AppError) {
    message = error.message;
    if (error instanceof NotFoundError) {
      code = grpc.status.NOT_FOUND;
    } else if (error instanceof ValidationError) {
      code = grpc.status.INVALID_ARGUMENT;
    } else if (error instanceof ConflictError) {
      code = grpc.status.ALREADY_EXISTS;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  Logger.error({ err: error }, `[gRPC] Request failed`);
  callback({ code, message }, null);
};

const createHandlers = (subscriptionService: SubscriptionService): ISubscriptionHandlers => ({
  Subscribe: async (call, callback) => {
    try {
      const { email, repository } = call.request;
      const subscription = await subscriptionService.subscribeToRepo(email, repository);

      callback(null, {
        status: 'success',
        message: 'Please check your email to confirm the subscription.',
        test_token: subscription.confirmToken || undefined,
      });
    } catch (error) {
      handleGrpcError(error, callback);
    }
  },

  Confirm: async (call, callback) => {
    try {
      const { token } = call.request;
      const subscription = await subscriptionService.confirmSubscription(token);

      callback(null, {
        status: 'success',
        message: `Success! You are now subscribed to ${subscription.repository}`,
      });
    } catch (error) {
      handleGrpcError(error, callback);
    }
  },

  Unsubscribe: async (call, callback) => {
    try {
      const { token } = call.request;
      const subscription = await subscriptionService.unsubscribeFromRepo(token);

      callback(null, {
        status: 'success',
        message: `You have successfully unsubscribed from ${subscription.repository}`,
      });
    } catch (error) {
      handleGrpcError(error, callback);
    }
  },

  GetSubscriptions: async (call, callback) => {
    try {
      const { email } = call.request;
      const subscriptions = await subscriptionService.getSubscriptionsByEmail(email);

      callback(null, {
        status: 'success',
        email,
        subscriptions: subscriptions.map((sub) => ({
          repository: sub.repository,
          status: sub.status,
          createdAt: sub.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      handleGrpcError(error, callback);
    }
  },
});

export const startGrpcServer = (subscriptionService: SubscriptionService): void => {
  const server = new grpc.Server();

  const handlers = createHandlers(subscriptionService);
  server.addService(subscriptionProto.SubscriptionService.service, handlers);

  const PORT = '0.0.0.0:50051';

  server.bindAsync(PORT, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
      Logger.error({ err: error }, '[gRPC] Failed to start server');
      
return;
    }

    server.start();
    Logger.info(`[gRPC] Server is successfully running on port ${port}`);
  });
};
