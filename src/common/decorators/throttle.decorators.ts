import { hours, minutes, Throttle } from '@nestjs/throttler';

export const AuthThrottle = () => Throttle({ default: { limit: 5, ttl: minutes(1) } });
export const SignupThrottle = () => Throttle({ default: { limit: 5, ttl: hours(1) } });
export const SensitiveThrottle = () => Throttle({ default: { limit: 3, ttl: hours(1) } });
export const OtpThrottle = () => Throttle({ default: { limit: 5, ttl: minutes(5) } });
