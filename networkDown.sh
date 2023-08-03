#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# Exit on first error
set -ex

# Bring the test network down
rm ~/dev/solib/nodeapp/wallet/*

pushd ~/fabric-samples/test-network
./network.sh down
popd
