const splitBuffer = require('buffer-chunks');
const { GitPktLine, padHex } = require('isomorphic-git/dist/internal.umd.min.js');

// Copied from https://github.com/isomorphic-git/isomorphic-git/blob/97fb6b4fd1051ef65256f2c674befe31e891b822/src/utils/FIFO.js
class FIFO {
  constructor () {
    this._queue = []
  }

  write (chunk) {
    if (this._ended) {
      throw Error('You cannot write to a FIFO that has already been ended!')
    }
    if (this._waiting) {
      const resolve = this._waiting
      this._waiting = null
      resolve({ value: chunk })
    } else {
      this._queue.push(chunk)
    }
  }

  end () {
    this._ended = true
    if (this._waiting) {
      const resolve = this._waiting
      this._waiting = null
      resolve({ done: true })
    }
  }

  destroy (err) {
    this._ended = true
    this.error = err
  }

  async next () {
    if (this._queue.length > 0) {
      return { value: this._queue.shift() }
    }
    if (this._ended) {
      return { done: true }
    }
    if (this._waiting) {
      throw Error(
        'You cannot call read until the previous call to read has returned!'
      )
    }
    return new Promise(resolve => {
      this._waiting = resolve
    })
  }
}

function gitPktLineEncode (line) {
  if (typeof line === 'string') {
    line = Buffer.from(line);
  }
  const length = line.length + 4;
  const hexlength = padHex(4, length);
  return Buffer.concat([Buffer.from(hexlength, 'utf8'), line])
}

// Adapted from https://github.com/isomorphic-git/isomorphic-git/blob/d7cea8806f477/src/models/GitSideBand.js#L73-L139
module.exports = function isoGitMuxSideBand ({
  protocol, // 'side-band' or 'side-band-64k'
	packetlines,
  packfile,
}) {
  const MAX_PACKET_LENGTH = protocol === 'side-band-64k' ? 65519 : 999
  let output = new FIFO();

  for (const packetline of packetlines) {
    output.write(GitPktLine.encode(packetline));
	}

  const buffers = splitBuffer(packfile, MAX_PACKET_LENGTH)
  for (const buffer of buffers) {
    output.write(
      gitPktLineEncode(Buffer.concat([Buffer.from('01', 'hex'), buffer]))
    )
  }

  if (buffers.length) {
	  output.write(Buffer.concat([
      gitPktLineEncode(Buffer.from('010A', 'hex')),
      GitPktLine.flush()
    ]));
	}

	output.end();

  return output
}

