/**
 * 雪花算法 ID 生成器
 * 生成 64 位唯一 ID
 */
export class SnowflakeIdGenerator {
  private readonly epoch = 1640995200000n; // 2022-01-01 00:00:00 UTC
  private readonly workerIdBits = 5n;
  private readonly datacenterIdBits = 5n;
  private readonly sequenceBits = 12n;

  private readonly maxWorkerId = -1n ^ (-1n << this.workerIdBits);
  private readonly maxDatacenterId = -1n ^ (-1n << this.datacenterIdBits);
  private readonly maxSequence = -1n ^ (-1n << this.sequenceBits);

  private readonly workerIdShift = this.sequenceBits;
  private readonly datacenterIdShift = this.sequenceBits + this.workerIdBits;
  private readonly timestampShift = this.sequenceBits + this.workerIdBits + this.datacenterIdBits;

  private workerId: bigint;
  private datacenterId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(workerId: number, datacenterId: number) {
    this.workerId = BigInt(workerId);
    this.datacenterId = BigInt(datacenterId);

    if (this.workerId > this.maxWorkerId || this.workerId < 0n) {
      throw new Error(`Worker ID must be between 0 and ${this.maxWorkerId}`);
    }

    if (this.datacenterId > this.maxDatacenterId || this.datacenterId < 0n) {
      throw new Error(`Datacenter ID must be between 0 and ${this.maxDatacenterId}`);
    }
  }

  /**
   * 生成下一个唯一 ID
   */
  public nextId(): bigint {
    let timestamp = this.getCurrentTimestamp();

    if (timestamp < this.lastTimestamp) {
      throw new Error('Clock moved backwards. Refusing to generate id');
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & this.maxSequence;
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    return (
      ((timestamp - this.epoch) << this.timestampShift) |
      (this.datacenterId << this.datacenterIdShift) |
      (this.workerId << this.workerIdShift) |
      this.sequence
    );
  }

  /**
   * 获取当前时间戳（毫秒）
   */
  private getCurrentTimestamp(): bigint {
    return BigInt(Date.now());
  }

  /**
   * 等待下一毫秒
   */
  private waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = this.getCurrentTimestamp();
    while (timestamp <= lastTimestamp) {
      timestamp = this.getCurrentTimestamp();
    }
    return timestamp;
  }
}

// 单例模式导出
let instance: SnowflakeIdGenerator | null = null;

export function initSnowflake(workerId: number, datacenterId: number): void {
  instance = new SnowflakeIdGenerator(workerId, datacenterId);
}

export function generateId(): bigint {
  if (!instance) {
    throw new Error('Snowflake not initialized. Call initSnowflake() first.');
  }
  return instance.nextId();
}
