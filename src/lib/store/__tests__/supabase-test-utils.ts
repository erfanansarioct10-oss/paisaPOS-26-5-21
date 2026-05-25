const JWT_CLOCK_SKEW_RETRY_DELAYS_MS = [500, 1000, 2000];

type SupabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike;
};

function isJwtIssuedAtFutureError(error: SupabaseErrorLike): boolean {
  return Boolean(
    error &&
    (error.code === "PGRST303" ||
      error.message?.toLowerCase().includes("jwt issued at future"))
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnTransientJwtClockSkew<T>(
  operation: () => PromiseLike<SupabaseResult<T>>
): Promise<SupabaseResult<T>> {
  let result = await operation();

  for (const delayMs of JWT_CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!isJwtIssuedAtFutureError(result.error)) {
      return result;
    }

    await sleep(delayMs);
    result = await operation();
  }

  return result;
}
