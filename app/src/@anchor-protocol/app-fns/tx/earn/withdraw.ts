import {
  AddressProvider,
  fabricateMarketRedeemStable,
} from '@anchor-protocol/anchor.js';
import {
  formatAUSTWithPostfixUnits,
  formatUSTWithPostfixUnits,
} from '@anchor-protocol/notation';
import { aUST, Gas, Rate, u, UST } from '@anchor-protocol/types';
import {
  pickAttributeValueByKey,
  pickEvent,
  pickRawLog,
  TxResultRendering,
  TxStreamPhase,
} from '@libs/app-fns';
import {
  _catchTxError,
  _createTxOptions,
  _pollTxInfo,
  _postTx,
  TxHelper,
} from '@libs/app-fns/tx/internal';
import { floor } from '@libs/big-math';
import {
  demicrofy,
  formatFluidDecimalPoints,
  stripUUSD,
} from '@libs/formatter';
import { QueryClient } from '@libs/query-client';
import { pipe } from '@rx-stream/pipe';
import { NetworkInfo, TxResult } from '@terra-money/use-wallet';
import { CreateTxOptions, Fee } from '@terra-money/terra.js';
import big, { BigSource } from 'big.js';
import { Observable } from 'rxjs';

export function earnWithdrawTx(
  $: Parameters<typeof fabricateMarketRedeemStable>[0] & {
    gasFee: Gas;
    gasAdjustment: Rate<number>;
    txFee: u<UST>;
    network: NetworkInfo;
    addressProvider: AddressProvider;
    queryClient: QueryClient;
    post: (tx: CreateTxOptions) => Promise<TxResult>;
    txErrorReporter?: (error: unknown) => string;
    onTxSucceed?: () => void;
  },
): Observable<TxResultRendering> {
  const helper = new TxHelper($);

  return pipe(
    _createTxOptions({
      msgs: fabricateMarketRedeemStable($)($.addressProvider),
      fee: new Fee($.gasFee, floor($.txFee) + 'uusd'),
      gasAdjustment: $.gasAdjustment,
    }),
    _postTx({ helper, ...$ }),
    _pollTxInfo({ helper, ...$ }),
    ({ value: txInfo }) => {
      const rawLog = pickRawLog(txInfo, 0);

      if (!rawLog) {
        return helper.failedToFindRawLog();
      }

      const fromContract = pickEvent(rawLog, 'from_contract');
      const transfer = pickEvent(rawLog, 'transfer');

      if (!fromContract || !transfer) {
        return helper.failedToFindEvents('from_contract', 'transfer');
      }

      try {
        const withdrawAmountUUSD = pickAttributeValueByKey<string>(
          transfer,
          'amount',
          (attrs) => attrs.reverse()[0],
        );

        const withdrawAmount = withdrawAmountUUSD
          ? stripUUSD(withdrawAmountUUSD)
          : undefined;

        const burnAmount = pickAttributeValueByKey<u<aUST>>(
          fromContract,
          'burn_amount',
        );

        const exchangeRate =
          withdrawAmount &&
          burnAmount &&
          (big(withdrawAmount).div(burnAmount) as Rate<BigSource> | undefined);

        return {
          value: null,

          phase: TxStreamPhase.SUCCEED,
          receipts: [
            withdrawAmount && {
              name: 'Withdraw Amount',
              value:
                formatUSTWithPostfixUnits(demicrofy(withdrawAmount)) + ' UST',
            },
            burnAmount && {
              name: 'Returned Amount',
              value:
                formatAUSTWithPostfixUnits(demicrofy(burnAmount)) + ' aUST',
            },
            exchangeRate && {
              name: 'Exchange Rate',
              value: formatFluidDecimalPoints(exchangeRate, 6),
            },
            helper.txHashReceipt(),
            helper.txFeeReceipt(),
          ],
        } as TxResultRendering;
      } catch (error) {
        return helper.failedToParseTxResult();
      }
    },
  )().pipe(_catchTxError({ helper, ...$ }));
}
