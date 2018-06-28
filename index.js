#!/usr/bin/env node

'use strict';

const dgram = require('dgram');
const net = require('net');
const { exec } = require('child_process');

const createMagicPacket = (macAddress) => {
  const mac = macAddress.split(':').map((n) => Number.parseInt(n, 16));

  const buffer = Buffer.alloc(6 + (6 * 16));

  for (let i = 0; i < 6; i += 1) {
    buffer[i] = 0xFF;
  }

  for (let i = 0; i < (6 * 16); i += 1) {
    buffer[i + 6] = mac[i % 6];
  }

  return buffer;
};

const scopeIdCommands = {
  darwin: 'netstat -rn -f inet6 | awk \'$1~/default/ {print $2; exit}\'',
  linux: 'netstat -rn -A inet6 | awk \'$4~/UG/ {print $2; exit}\'',
};

const getScopeId = () =>
  new Promise((resolve, reject) => {
    const command = scopeIdCommands[process.platform];
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(`${stdout}`.trim().split('%')[1]);
      }
    });
  });

const addresses = {
  4: '255.255.255.255',
  6: 'ff02::1%',
};

const wol = module.exports = (macAddress, address = 4) =>
  new Promise(async (resolve, reject) => {
    address = addresses[address] || address;
    const protocol = net.isIPv6(address) ? 'udp6' : 'udp4';
    const socket = dgram.createSocket(protocol);

    if (protocol === 'udp6') {
      address = `${address}${await getScopeId()}`;
    }

    socket.once('error', (error) => {
      reject(error);
      socket.close();
    });

    socket.once('listening', () => {
      socket.setBroadcast(true);
    });

    const magicPacket = createMagicPacket(macAddress);

    socket.send(magicPacket, 0, magicPacket.length, 9, address, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }

      socket.close();
    });
  });

if (require.main === module) {
  const { error } = console;
  const log = process.stdout.write.bind(process.stdout);

  const mac = process.argv[2];

  log('Sending via IPv4 and IPv6...\n');
  Promise.all([
    wol(mac, 4).then(() => {
      log('Sent IPv4\n');
    }),
    wol(mac, 6).then(() => {
      log('Sent IPv6\n');
    }),
  ]).catch(error);
}
