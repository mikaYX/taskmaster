import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-base';

// Determine sampling rate (default 100%)
const sampleRate = process.env.OTEL_TRACES_SAMPLER_ARG
  ? parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG)
  : 1.0;

const sampler =
  sampleRate >= 1
    ? new AlwaysOnSampler()
    : new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(sampleRate),
      });

// Configure the SDK
const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'taskmaster-backend',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
  }),
  sampler,
  traceExporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT })
    : new ConsoleSpanExporter(), // Fallback to console for easier debugging/dev
  spanProcessor: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new BatchSpanProcessor(
        new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
      )
    : new SimpleSpanProcessor(new ConsoleSpanExporter()),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        // Control Cardinality: group dynamic routes
        requestHook: (span: any, request: any) => {
          if (request?.headers) {
            // Example: span.setAttribute('http.client_ip', request.headers['x-forwarded-for'] || request.socket.remoteAddress);
          }
        },
        ignoreIncomingRequestHook: (request: any) => {
          // Ignore health checks / metrics to reduce noise
          return !!request.url?.match(/^\/(health|metrics)/);
        },
      },
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Too noisy
      },
      '@opentelemetry/instrumentation-net': {
        enabled: false, // Too noisy
      },
    }),
  ],
});

// Initialize the SDK
export async function bootstrapOTel() {
  try {
    await sdk.start();
    console.log('✅ OpenTelemetry SDK initialized');

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    console.log('Error initializing OpenTelemetry SDK', error);
  }
}
