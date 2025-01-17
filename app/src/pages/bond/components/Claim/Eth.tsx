import { COLLATERAL_DENOMS } from '@anchor-protocol/anchor.js';
import { validateTxFee } from '@anchor-protocol/app-fns';
import {
  useBondBEthClaimableRewards,
  useBondClaimTx,
} from '@anchor-protocol/app-provider';
import { useAnchorBank } from '@anchor-protocol/app-provider/hooks/useAnchorBank';
import { formatUST } from '@anchor-protocol/notation';
import { u, UST } from '@anchor-protocol/types';
import { useFixedFee, useUstTax } from '@libs/app-provider';
import { demicrofy } from '@libs/formatter';
import { ActionButton } from '@libs/neumorphism-ui/components/ActionButton';
import { IconSpan } from '@libs/neumorphism-ui/components/IconSpan';
import { InfoTooltip } from '@libs/neumorphism-ui/components/InfoTooltip';
import { StreamStatus } from '@rx-stream/react';
import { useConnectedWallet } from '@terra-money/wallet-provider';
import big, { Big } from 'big.js';
import { MessageBox } from 'components/MessageBox';
import { TxResultRenderer } from 'components/tx/TxResultRenderer';
import { TxFeeList, TxFeeListItem } from 'components/TxFeeList';
import { ViewAddressWarning } from 'components/ViewAddressWarning';
import { fixHMR } from 'fix-hmr';
import { estimatedAmountOfClaimBAsset } from 'pages/bond/logics/estimatedAmountOfClaimBAsset';
import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { RewardLayout } from './RewardLayout';

export interface ClaimEthProps {
  className?: string;
}

function ClaimEthBase({ className }: ClaimEthProps) {
  // ---------------------------------------------
  // dependencies
  // ---------------------------------------------
  const connectedWallet = useConnectedWallet();

  const fixedFee = useFixedFee();

  const { taxRate, maxTax } = useUstTax();

  const [claim, claimResult] = useBondClaimTx(COLLATERAL_DENOMS.UBETH);

  // ---------------------------------------------
  // queries
  // ---------------------------------------------
  const { tokenBalances } = useAnchorBank();

  const { data: { claimableReward } = {} } = useBondBEthClaimableRewards();

  // ---------------------------------------------
  // logics
  // ---------------------------------------------
  const invalidTxFee = useMemo(
    () => !!connectedWallet && validateTxFee(tokenBalances.uUST, fixedFee),
    [connectedWallet, tokenBalances.uUST, fixedFee],
  );

  const claimableRewards = useMemo(
    () => big(claimableReward?.rewards ?? 0) as u<UST<Big>>,
    [claimableReward],
  );

  const estimated = useMemo(() => {
    return estimatedAmountOfClaimBAsset(
      claimableRewards,
      taxRate,
      maxTax,
      fixedFee,
    );
  }, [claimableRewards, fixedFee, maxTax, taxRate]);

  // ---------------------------------------------
  // callbacks
  // ---------------------------------------------
  const proceedClaim = useCallback(() => {
    if (!connectedWallet || !claim) {
      return;
    }

    claim({});
  }, [claim, connectedWallet]);

  // ---------------------------------------------
  // presentation
  // ---------------------------------------------
  if (
    claimResult?.status === StreamStatus.IN_PROGRESS ||
    claimResult?.status === StreamStatus.DONE
  ) {
    return (
      <div className={className}>
        <TxResultRenderer
          resultRendering={claimResult.value}
          onExit={() => {
            switch (claimResult.status) {
              case StreamStatus.IN_PROGRESS:
                claimResult.abort();
                break;
              case StreamStatus.DONE:
                claimResult.clear();
                break;
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {!!invalidTxFee && claimableRewards.gt(0) && (
        <MessageBox>{invalidTxFee}</MessageBox>
      )}

      <RewardLayout>
        <h4>
          <IconSpan>
            Claimable Rewards{' '}
            <InfoTooltip>
              Claim staking rewards from minted bAssets that have not been
              provided as collateral. If the user's claimable reward is smaller
              than the gas fee, the rewards are not claimable.
            </InfoTooltip>
          </IconSpan>
        </h4>

        <p>
          {claimableRewards.gt(0) ? (
            <>
              {formatUST(demicrofy(claimableRewards))}
              <span>UST</span>
            </>
          ) : (
            '-'
          )}
        </p>

        <ViewAddressWarning>
          <ActionButton
            className="submit"
            disabled={
              !connectedWallet ||
              !connectedWallet.availablePost ||
              !claim ||
              !!invalidTxFee ||
              claimableRewards.lte(fixedFee)
            }
            onClick={() => proceedClaim()}
          >
            Claim
          </ActionButton>
        </ViewAddressWarning>
      </RewardLayout>

      {estimated && claim && estimated.estimatedAmount.gt(0) && (
        <TxFeeList className="claim-receipt">
          <TxFeeListItem label="Estimated Amount">
            {formatUST(demicrofy(estimated.estimatedAmount))} UST
          </TxFeeListItem>

          <TxFeeListItem label="Tx Fee">
            {formatUST(demicrofy(estimated.txFee))} UST
          </TxFeeListItem>
        </TxFeeList>
      )}
    </div>
  );
}

export const StyledClaimEth = styled(ClaimEthBase)`
  .claim-receipt {
    margin-top: 2em;
  }
`;

export const ClaimEth = fixHMR(StyledClaimEth);
