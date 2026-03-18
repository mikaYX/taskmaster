import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as net from 'net';
import { isPrivateIp } from '../utils/url-validator.util';

@Injectable()
export class LocalNetworkGuard implements CanActivate {
  private readonly logger = new Logger(LocalNetworkGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Obtenir la vraie adresse IP du client
    // Supporte les environnements de proxy inverse (X-Forwarded-For) limités mais
    // dans NestJS Express, request.ip contient l'adresse socket brute ou l'IP forwardée (si proxy de confiance).
    const clientIp = request.ip || request.socket.remoteAddress;

    if (!clientIp) {
      this.logger.warn('Forbidden: Impossible de résoudre l\'IP du client.');
      throw new ForbiddenException('Identification IP requise.');
    }

    // 1. Loopback Address (127.0.0.1, ::1)
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
      return true;
    }

    // 2. Extra Whitelisted IPs (via ENV)
    const allowedIpsString = this.configService.get<string>('MONITORING_ALLOW_IPS', '');
    if (allowedIpsString) {
      const allowedIps = allowedIpsString.split(',').map((ip) => ip.trim());
      if (allowedIps.includes(clientIp)) {
        return true;
      }
    }

    // 3. Fallback to Private IPs (RFC 1918, Docker internal networks, etc) si expressément voulu.
    // Pour des métriques, on le laisse fermé de base par défaut (seul loopback + explicity whitelisted IPs passent).
    
    // Si l'IP tombe ici, c'est refusé.
    this.logger.warn(`Forbidden: Accès aux métriques refusé pour l'IP externe : ${clientIp}`);
    throw new ForbiddenException('This endpoint is restricted to internal network or whitelisted IPs.');
  }
}
