package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	"gitlab.com/gomidi/midi/v2"
	"gitlab.com/gomidi/midi/v2/gm"
	"gitlab.com/gomidi/midi/v2/smf"
)

type response struct {
	Status      string `json:"status"`
	Destination string `json:"destination,omitempty"`
	Error       string `json:"error,omitempty"`
}

type midiJSON struct {
	TimeFormat string      `json:"timeFormat"`
	TrackNames []string    `json:"trackNames"`
	Tracks     []trackJSON `json:"tracks"`
}

type trackJSON struct {
	Index  int         `json:"index"`
	Name   string      `json:"name"`
	Events []eventJSON `json:"events"`
}

type eventJSON struct {
	// Delta           uint32         `json:"delta"`
	// AbsTicks        int64          `json:"absTicks"`
	AbsMicroseconds int64          `json:"absMicroseconds"`
	Type            string         `json:"type"`
	Data            map[string]any `json:"data,omitempty"`
}

func main() {
	if len(os.Args) != 2 {
		writeJSON(response{
			Status: "error",
			Error:  fmt.Sprintf("usage: %s <path-to-midi-file.mid>", os.Args[0]),
		})
		os.Exit(2)
	}

	reader := smf.ReadTracks(os.Args[1])
	if err := reader.Error(); err != nil {
		writeJSON(response{
			Status: "error",
			Error:  err.Error(),
		})
		os.Exit(1)
	}

	midiData := convertMIDI(reader)
	destination, err := writeMIDIJSONToTemp(midiData)
	if err != nil {
		writeJSON(response{
			Status: "error",
			Error:  err.Error(),
		})
		os.Exit(1)
	}

	writeJSON(response{
		Status:      "success",
		Destination: destination,
	})
}

func convertMIDI(reader *smf.TracksReader) midiJSON {
	smfFile := reader.SMF()
	tracks := make([]trackJSON, len(smfFile.Tracks))
	hasNotes := make([]bool, len(smfFile.Tracks))

	for index := range tracks {
		tracks[index].Index = index
	}

	reader.Do(func(te smf.TrackEvent) {
		name := ""
		if te.Message.GetMetaTrackName(&name) {
			tracks[te.TrackNo].Name = name
			return
		}

		if te.Message.GetNoteStart(nil, nil, nil) {
			hasNotes[te.TrackNo] = true
		}

		tracks[te.TrackNo].Events = append(tracks[te.TrackNo].Events, eventFromTrackEvent(te))
	})

	var result midiJSON
	result.TimeFormat = smfFile.TimeFormat.String()

	for index, track := range tracks {
		if !hasNotes[index] {
			continue
		}

		if track.Name == "" {
			track.Name = fmt.Sprintf("Track %d", track.Index+1)
		}

		result.TrackNames = append(result.TrackNames, track.Name)
		result.Tracks = append(result.Tracks, track)
	}

	return result
}

func eventFromTrackEvent(te smf.TrackEvent) eventJSON {
	eventType, data := messageData(te.Message)
	return eventJSON{
		// Delta:           te.Delta,
		// AbsTicks:        te.AbsTicks,
		AbsMicroseconds: te.AbsMicroSeconds,
		Type:            eventType,
		Data:            data,
	}
}

func messageData(message smf.Message) (string, map[string]any) {
	var channel, byte1, byte2 uint8
	var pbrelative int16
	var pbabsolute, seqnumber uint16
	var data []byte
	var text string
	var key, num, denom uint8
	var isMajor, isFlat bool
	var hour, minute, second, frame, fractframe uint8
	var bpm float64

	switch {
	case message.GetAfterTouch(&channel, &byte1):
		return "aftertouch", map[string]any{
			"channel":  channel,
			"pressure": byte1,
		}
	case message.GetControlChange(&channel, &byte1, &byte2):
		return "controlchange", map[string]any{
			"channel":        channel,
			"controller":     byte1,
			"controllername": midi.ControlChangeName[byte1],
			"value":          byte2,
		}
	case message.GetNoteOn(&channel, &byte1, &byte2):
		return "noteon", map[string]any{
			"channel":  channel,
			"key":      byte1,
			"keyname":  midi.Note(byte1).String(),
			"velocity": byte2,
		}
	case message.GetNoteOff(&channel, &byte1, &byte2):
		return "noteoff", map[string]any{
			"channel":  channel,
			"key":      byte1,
			"keyname":  midi.Note(byte1).String(),
			"velocity": byte2,
		}
	case message.GetPitchBend(&channel, &pbrelative, &pbabsolute):
		return "pitchbend", map[string]any{
			"absolute": pbabsolute,
			"channel":  channel,
			"relative": pbrelative,
		}
	case message.GetPolyAfterTouch(&channel, &byte1, &byte2):
		return "polyaftertouch", map[string]any{
			"channel":  channel,
			"key":      byte1,
			"keyname":  midi.Note(byte1).String(),
			"pressure": byte2,
		}
	case message.GetProgramChange(&channel, &byte1):
		return "programchange", map[string]any{
			"channel":     channel,
			"program":     byte1,
			"programname": gm.Instr(byte1).String(),
		}
	case message.GetSysEx(&data):
		return "sysex", map[string]any{"data": hex.EncodeToString(data)}
	case message.GetMetaChannel(&channel):
		return "channel", map[string]any{"channel": channel}
	case message.GetMetaCopyright(&text):
		return "copyright", map[string]any{"text": text}
	case message.GetMetaCuepoint(&text):
		return "cuepoint", map[string]any{"text": text}
	case message.GetMetaDevice(&text):
		return "device", map[string]any{"text": text}
	case message.GetMetaInstrument(&text):
		return "instrument", map[string]any{"text": text}
	case message.GetMetaKeySig(&key, &num, &isMajor, &isFlat):
		return "keysignature", map[string]any{
			"isFlat":  isFlat,
			"isMajor": isMajor,
			"key":     key,
			"num":     num,
		}
	case message.GetMetaLyric(&text):
		return "lyric", map[string]any{"text": text}
	case message.GetMetaMarker(&text):
		return "marker", map[string]any{"text": text}
	case message.GetMetaPort(&byte1):
		return "port", map[string]any{"port": byte1}
	case message.GetMetaProgramName(&text):
		return "programname", map[string]any{"text": text}
	case message.GetMetaSMPTEOffsetMsg(&hour, &minute, &second, &frame, &fractframe):
		return "smpteoffset", map[string]any{
			"fractframe": fractframe,
			"frame":      frame,
			"hour":       hour,
			"minute":     minute,
			"second":     second,
		}
	case message.GetMetaSeqData(&data):
		return "seqdata", map[string]any{"data": hex.EncodeToString(data)}
	case message.GetMetaSeqNumber(&seqnumber):
		return "seqnumber", map[string]any{"number": seqnumber}
	case message.GetMetaTempo(&bpm):
		return "tempo", map[string]any{"bpm": bpm}
	case message.GetMetaText(&text):
		return "text", map[string]any{"text": text}
	case message.GetMetaTimeSig(&num, &denom, &byte1, &byte2):
		return "timesignature", map[string]any{
			"clockspertick":            byte1,
			"demisemiquaverperquarter": byte2,
			"denom":                    denom,
			"num":                      num,
		}
	case message.GetMetaTrackName(&text):
		return "trackname", map[string]any{"text": text}
	default:
		return message.Type().String(), map[string]any{"raw": hex.EncodeToString(message)}
	}
}

func writeMIDIJSONToTemp(midiData midiJSON) (string, error) {
	data, err := json.Marshal(midiData)
	if err != nil {
		return "", fmt.Errorf("marshal midi json: %w", err)
	}

	file, err := os.CreateTemp("", "cavalry-midi-*.json")
	if err != nil {
		return "", fmt.Errorf("create temp json file: %w", err)
	}
	defer file.Close()

	if _, err := file.Write(data); err != nil {
		os.Remove(file.Name())
		return "", fmt.Errorf("write temp json file: %w", err)
	}

	return file.Name(), nil
}

func writeJSON(resp response) {
	data, err := json.Marshal(resp)
	if err != nil {
		fallback, _ := json.Marshal(response{
			Status: "error",
			Error:  err.Error(),
		})
		fmt.Println(string(fallback))
		return
	}

	fmt.Println(string(data))
}
