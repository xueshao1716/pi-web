# -*- coding: utf-8 -*-
"""
计算 1 到 50 之间的所有质数，并输出质数列表（含解释）。

质数（素数）的定义：
    一个大于 1 的自然数，如果除了 1 和它本身以外不再有其他因数，就称为质数。
    例如：2、3、5、7 都是质数；而 4 = 2 × 2、6 = 2 × 3 不是质数。
注意：1 不是质数（质数必须大于 1），所以从 2 开始判断。
"""

def is_prime(n: int) -> bool:
    """判断一个正整数 n 是否为质数。"""
    if n < 2:
        return False                 # 0 和 1 都不是质数
    if n == 2:
        return True                  # 2 是最小的质数
    if n % 2 == 0:
        return False                 # 大于 2 的偶数都不是质数
    # 只需检查 3 到 sqrt(n) 之间的奇数因子即可
    # 因为如果 n 有因子，必然有一个因子不超过 sqrt(n)
    divisor = 3
    while divisor * divisor <= n:
        if n % divisor == 0:
            return False             # 找到了除 1 和 n 之外的因子，不是质数
        divisor += 2
    return True

# 计算 1 到 50 的所有质数
start, end = 1, 50
primes = [n for n in range(start, end + 1) if is_prime(n)]

# 输出解释与结果
print(f"质数定义：大于 1 的自然数，且只能被 1 和它本身整除。")
print(f"注意：1 不是质数，因此从 2 开始判断。")
print(f"判断方法：对每个数 n，依次检查 3 到 sqrt(n) 的奇数能否整除 n（偶数提前排除）。")
print(f"")
print(f"1 到 {end} 之间的质数共有 {len(primes)} 个：")
print(f"{primes}")
print(f"")
print(f"逐个验证：")
for p in primes:
    # 展示每个质数不能被 2..sqrt(p) 中的任何整数整除（即只能被 1 和自身整除）
    print(f"  {p} 是质数")
