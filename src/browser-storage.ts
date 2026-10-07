// 一部のブラウザ設定では localStorage へのアクセス自体が例外になる
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
