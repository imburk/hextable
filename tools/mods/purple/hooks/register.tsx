import type { Register } from 'claude-code'

// A minimal band above the prompt, drawn on every render.
export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box backgroundColor="#7c3aed">
        <Text color="#ffffff" bold>
          Purple — support
        </Text>
      </Box>
    )
  })
}
