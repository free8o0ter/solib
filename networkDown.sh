#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# Exit on first error
set -ex

WALLET_D="./nodeapp/wallet"
# Bring the test network down
if [ -d ${WALLET_D} ]; then
    rm ${WALLET_D}/*
fi

pushd ~/fabric-samples/test-network
./network.sh down
popd
