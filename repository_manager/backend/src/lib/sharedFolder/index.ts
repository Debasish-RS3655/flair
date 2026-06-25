export const extractMetricsBefore = (matchedSharedFolder: any) => {
    const metricsBefore = (matchedSharedFolder.metrics_before_aggregation ?? [])
        .map((buf: any) => JSON.parse(Buffer.from(buf).toString('utf8')));
    return metricsBefore
};

export const extractMetricsAfter = (matchedSharedFolder: any) => {
    // Convert the raw binary metrics into JSON
    const metricsAfter = (matchedSharedFolder.metrics_after_aggregation ?? [])
        .map((buf:any) => {
            // buf is a Buffer (or Uint8Array) containing something like
            // '{"accuracy":0.101999998...,"loss":2.87584257}'
            const uint8string = Buffer.from(buf).toString('utf8');
            try {
                return JSON.parse(uint8string);
            } catch (err) {
                console.error('Failed to parse metrics JSON:', err, uint8string);
                return null;
            }
        })
        .filter((x:any) => x !== null);  // drop any that failed to parse
    return metricsAfter;
};