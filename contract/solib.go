/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
    "encoding/json"
    "fmt"
	"time"
	"log"


	"github.com/golang/protobuf/ptypes"
    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for managing a car
type SmartContract struct {
    contractapi.Contract
}

// State value = [registered, inRequest, rented, returned]
type Book struct {
    BookName   string `json:"name"`
    Owner  string `json:"owner"`
    State  string `json:"state"`
    Renter  string `json:"renter"`
}

type Content struct {
    BookId   string `json:"bookId"`
    UserId   string `json:"userId"`
    Message   string `json:"message"`
}

type HistoryQueryResult struct {
    Record    *Book   `json:"record"`
    TxId     string    `json:"txId"`
    Timestamp time.Time `json:"timestamp"`
    IsDelete  bool      `json:"isDelete"`
}

type QueryResult struct {
	Key    string `json:"Key"`
	Record *Book
}


// RegisterBook (bookName, publisher, pubDate, owner, state)
func (s *SmartContract) RegisterBook(ctx contractapi.TransactionContextInterface, bookName string, owner string) error {
    //중복 검사
    bookId := bookName + "_" + owner

    bookAsBytes, err := ctx.GetStub().GetState(bookId)

    if err != nil {
        return err;
    }

    if bookAsBytes != nil {
        return fmt.Errorf("%s already exist in world state", bookId);
    }
    
    book := Book{
        BookName:   bookName,
        Owner:  owner,
        State: "registered",
        Renter: "",
    }

    bookAsBytes, _ = json.Marshal(book)
    

    return ctx.GetStub().PutState(bookId, bookAsBytes)
}

// QueryBook(bookId)
func (s *SmartContract) QueryBook(ctx contractapi.TransactionContextInterface, bookId string) (*Book, error) {
    bookAsBytes, err := ctx.GetStub().GetState(bookId)

    if err != nil {
        return nil, fmt.Errorf("Failed to read from world state. %s", err.Error())
    }

    book := new(Book)
    _ = json.Unmarshal(bookAsBytes, book)

    return book, nil
}

// Preparing to rent book (id)  change state registered -> inRequest
func (s *SmartContract) ReqRent(ctx contractapi.TransactionContextInterface, bookId string, reqId string) error {
    book, err := s.QueryBook(ctx, bookId)

    if err != nil {
        return err
    }
    
    if book.State != "registered" && book.State != "returned" {
        return fmt.Errorf("%s STATE is not appropriate: %s ", bookId, book.State);
    }
    book.State = "inRequest"
    book.Renter = reqId;

    bookAsBytes, _ := json.Marshal(book)

    return ctx.GetStub().PutState(bookId, bookAsBytes)
}

// rent a book (id)  change state inRequest -> rented
func (s *SmartContract) RentBook(ctx contractapi.TransactionContextInterface, bookId string) error {
    book, err := s.QueryBook(ctx, bookId)

    if err != nil {
        return err
    }
    
    if book.State != "inRequest" {
        return fmt.Errorf("%s STATE is not appropriate: %s ", bookId, book.State);
    }
    book.State = "rented"
    

    bookAsBytes, _ := json.Marshal(book)

    return ctx.GetStub().PutState(bookId, bookAsBytes)
}

// return a book (id)  change state rented -> returned
func (s *SmartContract) ReturnBook(ctx contractapi.TransactionContextInterface, bookId string) error {
    book, err := s.QueryBook(ctx, bookId)

    if err != nil {
        return err
    }
    
    if book.State != "rented" {
        return fmt.Errorf("%s STATE is not appropriate: %s ", bookId, book.State);
    }
    book.State = "returned"
	book.Renter = ""


    bookAsBytes, _ := json.Marshal(book)

    return ctx.GetStub().PutState(bookId, bookAsBytes)
}


// history 
func (t *SmartContract) History(ctx contractapi.TransactionContextInterface, bookId string) ([]HistoryQueryResult, error) {
    log.Printf("History: ID %v", bookId)

    resultsIterator, err := ctx.GetStub().GetHistoryForKey(bookId)
    if err != nil {
        return nil, err
    }
    defer resultsIterator.Close()

    var records []HistoryQueryResult
    for resultsIterator.HasNext() {
        response, err := resultsIterator.Next()
        if err != nil {
            return nil, err
        }

        var asset Book
        if len(response.Value) > 0 {
            err = json.Unmarshal(response.Value, &asset)
            if err != nil {
                return nil, err
            }
        }

        timestamp, err := ptypes.Timestamp(response.Timestamp)
        if err != nil {
            return nil, err
        }

        record := HistoryQueryResult{
            TxId:      response.TxId,
            Timestamp: timestamp,
            Record:    &asset,
            IsDelete:  response.IsDelete,
        }
        records = append(records, record)
    }

    return records, nil
}

// QueryAllBook
func (s *SmartContract) QueryAllBook(ctx contractapi.TransactionContextInterface) ([]QueryResult, error) {
	startKey := ""
	endKey := ""

	resultsIterator, err := ctx.GetStub().GetStateByRange(startKey, endKey)

	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	results := []QueryResult{}

	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()

		if err != nil {
			return nil, err
		}

		book := new(Book)
		_ = json.Unmarshal(queryResponse.Value, book)

		queryResult := QueryResult{Key: queryResponse.Key, Record: book}
		results = append(results, queryResult)
	}

	return results, nil
}


func main() {

    chaincode, err := contractapi.NewChaincode(new(SmartContract))

    if err != nil {
        fmt.Printf("Error create project chaincode: %s", err.Error())
        return
    }

    if err := chaincode.Start(); err != nil {
        fmt.Printf("Error starting project chaincode: %s", err.Error())
    }
}