import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { Agent } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
  ['2002::', 16],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return !!family && !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/** Validate all DNS answers and pin the connection to one of those answers. */
export async function pushEndpointAgent(endpoint: string): Promise<Agent> {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Invalid push URL');
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(hostname);
    const addresses = family
      ? [{ address: hostname, family }]
      : await lookup(hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new Error('Non-public push address');
    }
    const selected = addresses[0];
    return new Agent({
      // No second DNS lookup: prevents rebinding between validation and connect.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
    });
  } catch {
    throw new BadRequestException('Invalid push endpoint');
  }
}
