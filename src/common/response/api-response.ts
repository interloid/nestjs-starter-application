export interface ApiError {
  field?: string;
  message: string;
  code?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  recordsPerPage: number;
  totalPages: number;
}

export interface ScrollPagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export type JsonValue =
  string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export class ApiResponse<T> {
  success!: boolean;
  statusCode!: number;
  message!: string;
  data?: T;
  paginationMeta?: PaginationMeta | ScrollPagination;
  metaData?: Record<string, JsonValue>;
  errors?: ApiError[];
  timestamp: string;
  path!: string;
  requestId?: string;

  private constructor(init: Partial<ApiResponse<T>>) {
    Object.assign(this, init);
    this.timestamp = init.timestamp ?? new Date().toISOString();
  }

  static success<T>(params: {
    data?: T;
    statusCode?: number;
    message?: string;
    paginationMeta?: PaginationMeta | ScrollPagination;
    metaData?: Record<string, JsonValue>;
  }): ApiResponse<T> {
    return new ApiResponse<T>({
      success: true,
      statusCode: params.statusCode ?? 200,
      message: params.message ?? 'OK',
      data: params.data,
      paginationMeta: params.paginationMeta,
      metaData: params.metaData,
      errors: undefined,
      path: '',
      requestId: undefined,
    });
  }

  static error(params: {
    statusCode: number;
    message: string;
    errors?: ApiError[];
  }): ApiResponse<never> {
    return new ApiResponse<never>({
      success: false,
      statusCode: params.statusCode,
      message: params.message,
      errors: params.errors,
      data: undefined,
      path: '',
      requestId: undefined,
    });
  }
}
